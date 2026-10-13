import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, View } from "react-native"
import { Pressable } from "react-native-gesture-handler"
import Animated from "react-native-reanimated"
import { Button, Card, CheckMark, DateField, FormScroll, IconButton, Text, TextField, useFlash } from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { apiJson, errorMessage } from "../../../lib/api"
import { nairobiToday, parseISODate, toISODate } from "../../../lib/dates"
import { haptics } from "../../../lib/haptics"
import { useMotion } from "../../../lib/motion"
import { captureScan } from "../../../lib/scanCapture"
import { scanFields } from "../../../lib/stock/scan-fields"
import { toast } from "../../../lib/toast"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import {
  addBatch, batchPreview, buildReceivePayload, fillFromScan, findScannedItem, initReceiveForm, isShort, outstandingPacks,
  receivableItems, removeBatch, setClose, setIncluded, updateBatch, MAX_BATCHES_PER_LINE, type BatchDraft, type ReceiveForm,
} from "../logic/receive"
import { packName, unitsText, type PoItem, type PurchaseOrderDetail } from "../logic/types"
import { CheckRow } from "./CheckRow"

interface ReceiveDeliveryProps {
  order: PurchaseOrderDetail
  onCancel: () => void
  /** Called with the updated order the server returns. */
  onDone: (order: PurchaseOrderDetail) => void
}

const cents = (kes: number) => Math.round(kes * 100)

function tomorrow(): Date {
  const d = parseISODate(nairobiToday()) ?? new Date()
  d.setDate(d.getDate() + 1)
  return d
}

/**
 * Check a delivery in against its purchase order — mirrors web's
 * ReceiveDeliveryPanel. Lines start with the outstanding packs and the PO's
 * cost; staff fill batch + expiry (or Scan the pack's GS1 code to fill them),
 * split a line into extra batches, and untick anything that didn't come.
 * Form logic + payload live in logic/receive.ts (unit-tested).
 */
export function ReceiveDelivery({ order, onCancel, onDone }: ReceiveDeliveryProps) {
  const theme = useTheme()
  const can = useCan()
  const canSeeCost = can("cost.view")
  const items = useMemo(() => receivableItems(order.items), [order.items])
  const [form, setForm] = useState<ReceiveForm>(() => initReceiveForm(order.items))
  const [today] = useState(nairobiToday)
  const [minExpiry] = useState(tomorrow)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  // Bumped on every matched scan so the same line pulses again on a re-scan.
  const [scanTick, setScanTick] = useState(0)
  // Success interstitial shown briefly before handing the updated order back.
  const [received, setReceived] = useState<{ order: PurchaseOrderDetail; message: string } | null>(null)

  const result = useMemo(() => buildReceivePayload(form, order.items, { canSeeCost, today }), [form, order.items, canSeeCost, today])
  const short = isShort(form, order.items)

  async function scan() {
    const code = await captureScan()
    if (!code) return
    const fields = scanFields(code)
    const item = findScannedItem(order.items, fields)
    if (!item) {
      haptics.error()
      toast.error("That barcode isn't on this order")
      return
    }
    setForm((f) => fillFromScan(f, item.id, fields).form)
    setLastScanned(item.id)
    setScanTick((n) => n + 1)
    haptics.success()
    toast.success(`Matched ${item.product_name}${fields.batchNumber ? ` · batch ${fields.batchNumber}` : ""}`)
  }

  async function submit() {
    setAttempted(true)
    if (!result.payload) {
      haptics.error()
      toast.error(result.problems[0] ?? "Check the highlighted fields")
      return
    }
    setSaving(true)
    try {
      const res = await apiJson<{ order: PurchaseOrderDetail; batches: number; complete: boolean }>(
        `/api/purchase-orders/${order.id}/receive`,
        { method: "POST", body: result.payload },
      )
      haptics.success()
      setReceived({
        order: res.order,
        message: `${res.batches} batch${res.batches === 1 ? "" : "es"} added to stock${res.complete ? " — order complete" : " — items still outstanding"}`,
      })
    } catch (err) {
      haptics.error()
      toast.error(errorMessage(err, "Couldn't receive the delivery. Nothing was added — please try again."))
    } finally {
      setSaving(false)
    }
  }

  const s = result.summary
  const footer = (
    <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
      <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={saving} style={styles.flex} />
      <Button
        title="Confirm receipt"
        onPress={() => submit()}
        loading={saving}
        style={styles.grow}
        leadingIcon={<Ionicons name="checkmark-done" size={18} color={theme.onAccent} />}
      />
    </View>
  )

  return (
    <View style={styles.flex}>
    <FormScroll footer={footer}>
      <View style={[styles.tip, { backgroundColor: theme.green50, borderColor: theme.green100 }]}>
        <Ionicons name="barcode-outline" size={20} color={theme.green600} />
        <Text variant="caption" style={styles.flex}>
          Scan each pack&apos;s barcode to fill in its batch number and expiry, or type them. Untick anything that didn&apos;t arrive.
        </Text>
      </View>
      <Button
        title="Scan a pack"
        variant="secondary"
        onPress={() => scan()}
        disabled={saving}
        leadingIcon={<Ionicons name="scan-outline" size={18} color={theme.text} />}
      />

      {items.map((item) => (
        <LineCard
          key={item.id}
          item={item}
          form={form}
          setForm={setForm}
          canSeeCost={canSeeCost}
          minExpiry={minExpiry}
          highlight={lastScanned === item.id}
          pulse={lastScanned === item.id ? scanTick : 0}
          errors={attempted ? result.errors : {}}
          lineError={attempted ? (result.lineErrors[item.id] ?? null) : null}
        />
      ))}

      <Card style={styles.summary}>
        <Text variant="bodyStrong">
          Receiving {s.lines} of {items.length} item{items.length === 1 ? "" : "s"}
        </Text>
        <Text tone="secondary">
          {s.batches} batch{s.batches === 1 ? "" : "es"} · {s.packs.toLocaleString("en-KE")} pack{s.packs === 1 ? "" : "s"} ={" "}
          {s.units.toLocaleString("en-KE")} units into stock
        </Text>
        {s.invoiceCents != null ? (
          <Text tone="secondary">
            Invoice value <Text variant="bodyStrong" tabular>{formatKES(s.invoiceCents)}</Text>
          </Text>
        ) : null}
        {short ? (
          <CheckRow
            checked={form.close}
            onChange={(v) => setForm((f) => setClose(f, v))}
            title="Close the order even if some items came short"
            subtitle="No more deliveries will be expected for this order."
          />
        ) : null}
        {attempted && result.problems.length > 0 ? (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {result.problems.length === 1 ? result.problems[0] : `${result.problems.length} things to fix — see the highlighted fields.`}
          </Text>
        ) : null}
      </Card>
    </FormScroll>
    {received ? (
      <ReceivedInterstitial message={received.message} onContinue={() => onDone(received.order)} />
    ) : null}
    </View>
  )
}

const INTERSTITIAL_MS = 1100

/**
 * "Stock received" moment after a confirmed delivery: a check draws in, then
 * the order screen takes over on its own (or straight away on tap).
 */
function ReceivedInterstitial({ message, onContinue }: { message: string; onContinue: () => void }) {
  const theme = useTheme()
  const m = useMotion()
  const done = useRef(false)
  const finish = useRef(onContinue)
  useEffect(() => {
    finish.current = onContinue
  })
  const go = () => {
    if (done.current) return
    done.current = true
    finish.current()
  }
  useEffect(() => {
    const t = setTimeout(go, m.reduced ? 600 : INTERSTITIAL_MS)
    return () => clearTimeout(t)
    // Runs once when shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <Animated.View entering={m.fadeIn} style={[styles.interstitial, { backgroundColor: theme.bg }]}>
      <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={`${message}. Continue`} style={styles.interstitialBody}>
        <Animated.View entering={m.popAt(60)} style={[styles.successDisc, { backgroundColor: theme.green50 }]}>
          <CheckMark size={56} color={theme.green600} delay={m.reduced ? 0 : 180} />
        </Animated.View>
        <Animated.View entering={m.stagger(0, 220)}>
          <Text variant="title" align="center" accessibilityRole="header">
            Stock received
          </Text>
          <Text tone="secondary" align="center">
            {message}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

interface LineCardProps {
  item: PoItem
  form: ReceiveForm
  setForm: (fn: (f: ReceiveForm) => ReceiveForm) => void
  canSeeCost: boolean
  minExpiry: Date
  highlight: boolean
  /** Changes on every matched scan of this line → one green pulse. */
  pulse: number
  errors: ReturnType<typeof buildReceivePayload>["errors"]
  lineError: string | null
}

function LineCard({ item, form, setForm, canSeeCost, minExpiry, highlight, pulse, errors, lineError }: LineCardProps) {
  const theme = useTheme()
  const { style: flashStyle, flash } = useFlash()
  useEffect(() => {
    if (pulse > 0) flash()
  }, [pulse, flash])
  const line = form.lines[item.id]
  if (!line) return null
  const out = outstandingPacks(item)
  const subtitle =
    `Ordered ${item.quantity_ordered} × ${packName(item)}` +
    (item.quantity_received > 0 ? ` · ${item.quantity_received} already received` : "") +
    (out === 0 ? " · complete" : ` · ${out} outstanding`)
  const name = `${item.product_name}${item.product_strength ? ` ${item.product_strength}` : ""}`

  return (
    <Card style={[styles.line, highlight && { borderColor: theme.green }, !line.included && styles.dim]}>
      <Animated.View pointerEvents="none" style={[styles.pulse, { backgroundColor: theme.green100 }, flashStyle]} />
      <CheckRow checked={line.included} onChange={(v) => setForm((f) => setIncluded(f, item.id, v))} title={name} subtitle={subtitle} />
      {line.included ? (
        <View style={styles.batches}>
          {line.batches.map((b, n) => (
            <BatchFields
              key={b.key}
              item={item}
              batch={b}
              index={n}
              count={line.batches.length}
              canSeeCost={canSeeCost}
              minExpiry={minExpiry}
              errors={errors[b.key] ?? {}}
              onChange={(patch) => setForm((f) => updateBatch(f, item.id, b.key, patch))}
              onRemove={() => setForm((f) => removeBatch(f, item.id, b.key))}
            />
          ))}
          {lineError ? (
            <Text variant="caption" tone="danger">
              {lineError}
            </Text>
          ) : null}
          {line.batches.length < MAX_BATCHES_PER_LINE ? (
            <Button
              title="Add another batch"
              variant="ghost"
              size="sm"
              onPress={() => setForm((f) => addBatch(f, item.id))}
              accessibilityLabel={`Add another batch of ${name}`}
              leadingIcon={<Ionicons name="add" size={18} color={theme.text} />}
              style={styles.addBatch}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  )
}

interface BatchFieldsProps {
  item: PoItem
  batch: BatchDraft
  index: number
  count: number
  canSeeCost: boolean
  minExpiry: Date
  errors: { batchNumber?: string; expiry?: string; packs?: string; unitCost?: string }
  onChange: (patch: Partial<Omit<BatchDraft, "key">>) => void
  onRemove: () => void
}

function BatchFields({ item, batch, index, count, canSeeCost, minExpiry, errors, onChange, onRemove }: BatchFieldsProps) {
  const theme = useTheme()
  const preview = batchPreview(batch, item, canSeeCost)
  const unit = item.base_unit ?? "unit"
  const packsHelper = preview.units != null ? `= ${unitsText(preview.units, unit)}` : null
  let costHelper: string | null = null
  if (preview.costDiffCents != null && item.unit_cost != null) {
    costHelper = `Ordered at ${formatKES(cents(item.unit_cost))}/pack — invoice is ${preview.costDiffCents > 0 ? "higher" : "lower"} by ${formatKES(Math.abs(preview.costDiffCents))}`
  } else if (preview.costPerUnit != null) {
    costHelper = `${formatKES(cents(preview.costPerUnit))} per ${unit}`
  }

  return (
    <View style={[styles.batch, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      {count > 1 ? (
        <View style={styles.batchHead}>
          <Text variant="label" tone="secondary" style={styles.flex}>
            Batch {index + 1}
          </Text>
          <IconButton icon="trash-outline" variant="danger" size={18} accessibilityLabel={`Remove batch ${index + 1} of ${item.product_name}`} onPress={onRemove} />
        </View>
      ) : null}
      <TextField
        label="Batch number"
        value={batch.batchNumber}
        onChangeText={(t) => onChange({ batchNumber: t })}
        placeholder="e.g. AMX2310"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={80}
        error={errors.batchNumber}
      />
      <DateField
        label="Expiry date"
        value={parseISODate(batch.expiry)}
        onChange={(d) => onChange({ expiry: toISODate(d) })}
        minimumDate={minExpiry}
        error={errors.expiry}
      />
      <View style={styles.pair}>
        <TextField
          label="Packs received"
          value={batch.packs}
          onChangeText={(t) => onChange({ packs: t.replace(/[^\d]/g, "") })}
          keyboardType="number-pad"
          error={errors.packs}
          helper={packsHelper}
          containerStyle={styles.flex}
        />
        {canSeeCost ? (
          <TextField
            label="Cost per pack (KES)"
            value={batch.unitCost}
            onChangeText={(t) => onChange({ unitCost: t.replace(/[^\d.,]/g, "") })}
            keyboardType="decimal-pad"
            placeholder={item.unit_cost != null ? String(item.unit_cost) : "Optional"}
            error={errors.unitCost}
            helper={costHelper}
            containerStyle={styles.flex}
          />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flex: 2 },
  tip: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  line: { gap: space.sm, padding: space.md },
  dim: { opacity: 0.7 },
  batches: { gap: space.md, paddingLeft: space.xl },
  batch: { gap: space.sm, paddingTop: space.sm },
  batchHead: { flexDirection: "row", alignItems: "center" },
  pair: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  addBatch: { alignSelf: "flex-start" },
  summary: { gap: space.xs, padding: space.md },
  footer: { flexDirection: "row", gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  pulse: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.lg - 2, opacity: 0 },
  interstitial: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  interstitialBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.xl },
  successDisc: { width: 96, height: 96, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
})
