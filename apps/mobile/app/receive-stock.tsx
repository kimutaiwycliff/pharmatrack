import { useRef, useState } from "react"
import { StyleSheet, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  Button,
  Card,
  DateField,
  EmptyState,
  ErrorState,
  FormScroll,
  ListRow,
  Money,
  NeedsInternet,
  Screen,
  ScreenHeader,
  Sheet,
  SkeletonList,
  Text,
  TextField,
  useIsOnline,
} from "../src/components"
import { useCan } from "../src/hooks/useCan"
import { useQuery } from "../src/hooks/useQuery"
import { apiJson, errorMessage } from "../src/lib/api"
import { useIdempotencyKey } from "../src/lib/useIdempotencyKey"
import { parseISODate, toISODate } from "../src/lib/dates"
import { env } from "../src/lib/env"
import { printLabel, shareLabelPDF } from "../src/lib/labels/printLabel"
import { captureScan } from "../src/lib/scanCapture"
import { scanFields, scanMatchesProduct } from "../src/lib/stock/scan-fields"
import { costPerPack, costPerUnit, parseAmount } from "../src/lib/stock/units"
import { toast } from "../src/lib/toast"
import { receiveLocalStock } from "../src/repo/inventory"
import { useBranchScope } from "../src/store/branchScope"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import { radius, space } from "../src/theme/tokens"
import { ProductPicker } from "../src/features/inventory/components/ProductPicker"
import { getReceiveProduct, listSuppliers, lookupReceiveProduct, useInventoryVersion } from "../src/features/inventory/data"
import { buildReceiveBody, unitsPreview } from "../src/features/inventory/logic/receive"
import type { ReceiveProduct } from "../src/features/inventory/logic/types"

// Receive stock — one batch at a time, mirroring apps/web/components/inventory/
// StockReceiveForm.tsx and POST /api/batches (logic/receive.ts builds the body):
// pick or scan the product, batch number + expiry (a GS1 DataMatrix scan fills
// both), quantity in PACKS shown as base units, cost per PACK (cost.view only)
// stored per base unit, optional supplier. Afterwards it offers barcode
// stickers for the units received (the old batches screen's label printing).
// Offline Edition: repo/inventory.ts's receiveLocalStock (no supplier there).

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE
const MAX_LABEL_COPIES = 100

function tomorrow(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d
}

interface Received {
  product: ReceiveProduct
  units: number
  batchNumber: string
}

export default function ReceiveStock() {
  const can = useCan()
  const online = useIsOnline()
  const theme = useTheme()
  const canReceive = can("stock.receive")

  if (!canReceive) {
    return (
      <Screen>
        <ScreenHeader title="Receive stock" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          message="You don't have permission to receive stock. Ask the owner or a manager."
        />
      </Screen>
    )
  }
  if (!OFFLINE && !online) {
    return (
      <Screen>
        <ScreenHeader title="Receive stock" />
        <NeedsInternet feature="Receiving stock" />
      </Screen>
    )
  }
  return <ReceiveForm />
}

function ReceiveForm() {
  const theme = useTheme()
  const can = useCan()
  const canSeeCost = can("cost.view")
  const { productId } = useLocalSearchParams<{ productId?: string }>()
  const scope = useBranchScope()
  const sessionBranchId = useSessionStore((s) => s.branchId)
  const branches = useSessionStore((s) => s.branches)
  const bumpAll = useInventoryVersion((s) => s.bumpAll)

  // Stock lands in the branch being viewed; "All branches" falls back to the
  // signed-in branch (the server pins branch-locked staff to theirs anyway).
  const branchId = OFFLINE ? sessionBranchId : (scope.branchId ?? sessionBranchId)
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null

  const fixed = useQuery(productId ? `receive-product:${productId}` : null, () => getReceiveProduct(productId!))
  const [picked, setPicked] = useState<ReceiveProduct | null>(null)
  const product = picked ?? fixed.data ?? null

  const [batchNumber, setBatchNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [packs, setPacks] = useState("1")
  const [cost, setCost] = useState("")
  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(null)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [received, setReceived] = useState<Received | null>(null)
  const [printing, setPrinting] = useState<"print" | "share" | null>(null)

  // Prefill cost per pack from the product's stored cost per unit, once per
  // product (web's selectProduct does the same).
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null)
  if (product && product.id !== prefilledFor) {
    setPrefilledFor(product.id)
    const c = costPerPack(product.cost_price, product.units_per_pack)
    setCost(canSeeCost && c != null ? String(c) : "")
  }

  const suppliers = useQuery(!OFFLINE && supplierOpen ? "suppliers" : null, () => listSuppliers())

  const upp = Math.max(1, product?.units_per_pack ?? 1)
  const packLabel = product?.pack_label?.trim() || "pack"
  const baseUnit = product?.base_unit?.trim() || "unit"
  const result = buildReceiveBody({
    productId: product?.id ?? null,
    branchId,
    batchNumber,
    expiry,
    packsText: packs,
    unitsPerPack: upp,
    costPerPackText: cost,
    includeCost: canSeeCost,
    supplierId: supplier?.id ?? null,
  })
  const errors = submitted && !result.ok ? result.errors : {}
  const perPack = parseAmount(cost)
  const costHelper = perPack != null && upp > 1 ? `= KES ${costPerUnit(perPack, upp).toFixed(2)} per ${baseUnit}` : `Per ${packLabel}, as on the supplier invoice`

  async function scan() {
    setScanning(true)
    try {
      const raw = await captureScan()
      if (!raw) return
      const f = scanFields(raw)
      let target = product
      if (!target || !scanMatchesProduct(f, target)) {
        const found = await lookupReceiveProduct([f.gtin, f.raw], branchId)
        if (!found) {
          toast.error("No product with that barcode. Add it under Products first.")
          return
        }
        if (productId && fixed.data && found.id !== fixed.data.id) {
          toast.error(`That pack is ${found.name}, not ${fixed.data.name}.`)
          return
        }
        target = found
        setPicked(found)
      }
      if (f.batchNumber) setBatchNumber(f.batchNumber)
      if (f.expiry) setExpiry(f.expiry)
      if (f.batchNumber || f.expiry) toast.info("Batch and expiry filled from the pack")
      else toast.info(`${target.name} selected — enter the batch and expiry`)
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't read that barcode. Try scanning again."))
    } finally {
      setScanning(false)
    }
  }

  // Ref guard (not `saving`): a second tap before the re-render would POST a
  // duplicate batch. The Idempotency-Key covers the rest: a retry after a
  // timeout (the first request may have gone through) is replayed, not re-booked.
  const submitting = useRef(false)
  const idem = useIdempotencyKey()

  async function submit() {
    if (submitting.current) return
    setSubmitted(true)
    if (!result.ok || !product) return
    const body = result.body
    submitting.current = true
    setSaving(true)
    try {
      if (OFFLINE) {
        await receiveLocalStock({
          productId: body.product_id,
          branchId: body.branch_id,
          batchNumber: body.batch_number,
          expiryDate: body.expiry_date,
          quantityReceived: body.quantity_received,
          costPrice: body.cost_price ?? null,
        })
      } else {
        await apiJson("/api/batches", { method: "POST", body, headers: idem.headerFor(body) })
        idem.reset()
      }
      bumpAll()
      toast.success(`Received ${body.quantity_received.toLocaleString("en-KE")} × ${product.name}`)
      setReceived({ product, units: body.quantity_received, batchNumber: body.batch_number })
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't receive the stock. Check the details and try again."))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  function receiveAnother() {
    setReceived(null)
    setSubmitted(false)
    setBatchNumber("")
    setExpiry("")
    setPacks("1")
    if (!productId) {
      setPicked(null)
      setPrefilledFor(null)
      setSupplier(null)
    }
  }

  async function labels(mode: "print" | "share") {
    const code = received?.product.gtin ?? received?.product.barcode_raw
    if (!received || !code) return
    setPrinting(mode)
    try {
      const input = { code, productName: received.product.name, copies: Math.min(received.units, MAX_LABEL_COPIES) }
      if (mode === "print") await printLabel(input)
      else await shareLabelPDF(input)
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't make the barcode stickers. Check the printer and try again."))
    } finally {
      setPrinting(null)
    }
  }

  if (received) {
    const hasBarcode = !!(received.product.gtin ?? received.product.barcode_raw)
    return (
      <Screen>
        <ScreenHeader title="Stock received" />
        <FormScroll>
          <Card style={[styles.done, { borderColor: theme.green }]}>
            <Ionicons name="checkmark-circle" size={36} color={theme.green} />
            <Text variant="headline">{received.product.name}</Text>
            <Text tone="secondary">
              {received.units.toLocaleString("en-KE")} {received.units === 1 ? baseUnit : `${baseUnit}s`} added as batch {received.batchNumber}
              {branchName ? ` at ${branchName}` : ""}.
            </Text>
          </Card>
          {hasBarcode ? (
            <View style={styles.group}>
              <Text variant="label" tone="secondary">
                Print barcode stickers ({Math.min(received.units, MAX_LABEL_COPIES)})
              </Text>
              <View style={styles.row}>
                <Button
                  title="Print"
                  variant="secondary"
                  onPress={() => labels("print")}
                  loading={printing === "print"}
                  leadingIcon={<Ionicons name="print-outline" size={18} color={theme.text} />}
                  style={styles.flex}
                />
                <Button
                  title="Share PDF"
                  variant="secondary"
                  onPress={() => labels("share")}
                  loading={printing === "share"}
                  leadingIcon={<Ionicons name="share-outline" size={18} color={theme.text} />}
                  style={styles.flex}
                />
              </View>
            </View>
          ) : null}
          <View style={styles.row}>
            <Button title="Receive another" variant="secondary" onPress={receiveAnother} style={styles.flex} />
            <Button title="Done" onPress={() => router.back()} style={styles.flex} />
          </View>
        </FormScroll>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Receive stock" subtitle={branchName ? `Into ${branchName}` : null} />
      {productId && fixed.loading ? (
        <SkeletonList rows={4} />
      ) : productId && fixed.error && !fixed.data ? (
        <ErrorState message={fixed.error} onRetry={fixed.retry} />
      ) : (
        <FormScroll
          footer={
            <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
              <Button
                title="Receive stock"
                onPress={() => submit()}
                loading={saving}
                leadingIcon={<Ionicons name="checkmark-circle-outline" size={20} color={theme.onAccent} />}
              />
            </View>
          }
        >
          <Button
            title={scanning ? "Opening camera…" : "Scan pack barcode"}
            variant="secondary"
            onPress={() => scan()}
            disabled={scanning}
            accessibilityHint="A GS1 DataMatrix fills in the batch number and expiry"
            leadingIcon={<Ionicons name="scan-outline" size={20} color={theme.text} />}
          />

          {product ? (
            <View style={[styles.selected, { borderColor: theme.green, backgroundColor: theme.surface }]}>
              <ListRow
                title={`${product.name}${product.strength ? ` ${product.strength}` : ""}`}
                subtitle={[product.brand_name, `1 ${packLabel} = ${upp} ${upp === 1 ? baseUnit : `${baseUnit}s`}`].filter(Boolean).join(" · ")}
                leading={<Ionicons name="checkmark-circle" size={22} color={theme.green} />}
                trailing={
                  productId ? null : (
                    <Button
                      title="Change"
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setPicked(null)
                        setPrefilledFor(null)
                      }}
                      accessibilityLabel="Choose a different product"
                    />
                  )
                }
              />
            </View>
          ) : (
            <ProductPicker branchId={branchId} onPick={setPicked} error={errors.product} />
          )}

          <TextField
            label="Batch number"
            value={batchNumber}
            onChangeText={setBatchNumber}
            placeholder="e.g. BN240815"
            autoCapitalize="characters"
            autoCorrect={false}
            error={errors.batchNumber}
          />
          <DateField
            label="Expiry date"
            value={parseISODate(expiry)}
            onChange={(d) => setExpiry(toISODate(d))}
            minimumDate={tomorrow()}
            error={errors.expiry}
          />
          <TextField
            label={`Quantity (${packLabel}s)`}
            value={packs}
            onChangeText={setPacks}
            keyboardType="number-pad"
            error={errors.packs}
            helper={unitsPreview(packs, upp, baseUnit) ?? `How many ${packLabel}s arrived`}
          />
          {canSeeCost ? (
            <TextField
              label={`Cost per ${packLabel} (KES, optional)`}
              value={cost}
              onChangeText={setCost}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={errors.cost}
              helper={costHelper}
            />
          ) : null}
          {canSeeCost && result.ok && result.body.cost_price != null ? (
            <Text variant="caption" tone="secondary">
              Batch value{" "}
              <Money cents={Math.round(result.body.cost_price * 100) * result.body.quantity_received} variant="caption" tone="secondary" />
            </Text>
          ) : null}

          {OFFLINE ? null : (
            <View style={styles.group}>
              <Text variant="label" tone="secondary">
                Supplier (optional)
              </Text>
              <View style={[styles.selected, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <ListRow
                  title={supplier?.name ?? "No supplier"}
                  onPress={() => setSupplierOpen(true)}
                  accessibilityLabel={`Supplier: ${supplier?.name ?? "none"}. Change supplier`}
                  trailing={<Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
                />
              </View>
            </View>
          )}
          {errors.branch ? (
            <Text variant="caption" tone="danger">
              {errors.branch}
            </Text>
          ) : null}
        </FormScroll>
      )}

      {OFFLINE ? null : (
        <Sheet open={supplierOpen} onClose={() => setSupplierOpen(false)} title="Supplier" scrollable>
          {suppliers.loading ? (
            <SkeletonList rows={4} />
          ) : suppliers.error ? (
            <ErrorState compact message={suppliers.error} onRetry={suppliers.retry} />
          ) : (
            <View>
              <ListRow
                title="No supplier"
                onPress={() => {
                  setSupplier(null)
                  setSupplierOpen(false)
                }}
                trailing={supplier == null ? <Ionicons name="checkmark" size={20} color={theme.green} /> : null}
              />
              {(suppliers.data ?? []).map((s) => (
                <ListRow
                  key={s.id}
                  title={s.name}
                  onPress={() => {
                    setSupplier(s)
                    setSupplierOpen(false)
                  }}
                  trailing={supplier?.id === s.id ? <Ionicons name="checkmark" size={20} color={theme.green} /> : null}
                />
              ))}
              {suppliers.data && suppliers.data.length === 0 ? (
                <Text tone="secondary" style={styles.sheetNote}>
                  No suppliers yet — add them under Suppliers.
                </Text>
              ) : null}
            </View>
          )}
        </Sheet>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: space.xs },
  row: { flexDirection: "row", gap: space.sm },
  selected: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  done: { alignItems: "center", gap: space.sm, paddingVertical: space.xl, borderWidth: 1 },
  footer: { paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  sheetNote: { padding: space.md },
})
