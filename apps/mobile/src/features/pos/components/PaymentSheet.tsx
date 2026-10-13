import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useEffect, useRef, useState } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { AnimatedNumber, Button, Chip, MpesaFlow, NumericKeypad, PressableScale, Sheet, Text, TextField } from "../../../components"
import { env } from "../../../lib/env"
import { keypadNumber } from "../../../lib/keypad"
import { useMotion } from "../../../lib/motion"
import type { CartItem } from "../../../store/cart"
import { useTheme } from "../../../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../../../theme/tokens"
import { cartTotals, needsPrescriptionCheck } from "../logic/cart"
import { changeCents, quickCashOptions } from "../logic/quickCash"

// "till" = M-Pesa paid to the shop's till/paybill and keyed in by hand —
// works offline, uploaded with mpesa_verified=false for the owner to check.
type Method = "cash" | "mpesa" | "till" | "split"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE
const MPESA_CODE_RE = /^[A-Z0-9]{10}$/i

export interface PaymentSheetProps {
  open: boolean
  onClose: () => void
  items: CartItem[]
  /** Tenant plan + config allow STK push (fetched by the POS, retried). */
  mpesaOffered: boolean
  /** Why M-Pesa prompts / Split aren't offered (null when they are). */
  mpesaNote?: string | null
  isOnline: boolean
  committing: boolean
  error: string | null
  // Each may return a promise: the button pressed then spins and ignores taps
  // until the commit settles (the POS also holds its own in-flight lock).
  onCash: (tenderedCents: number) => unknown
  onMpesa: (reference: string | null) => unknown
  onTill: (code: string | null) => unknown
  onSplit: (cashCents: number, mpesaCents: number, reference: string | null) => unknown
}

const RX_HINT = "Tick “Prescription seen” above to complete the sale."

/** Cash amount being entered: keypad digits (whole KES) or an exact quick-cash amount in cents. */
interface Tender {
  digits: string
  exactCents: number | null
}
const tenderCents = (t: Tender) => t.exactCents ?? keypadNumber(t.digits) * 100

// Payment, kept deliberately short: big total, pick a method, cash on a big
// keypad (never the system keyboard) with quick-cash amounts and a live
// change figure. Rx / controlled lines must be confirmed first. Mount a fresh
// one per checkout (key it) so nothing carries over from the last sale.
export function PaymentSheet(p: PaymentSheetProps) {
  const theme = useTheme()
  const m = useMotion()
  const total = cartTotals(p.items).total
  const rx = needsPrescriptionCheck(p.items)
  const [method, setMethod] = useState<Method>("cash")
  const [tender, setTender] = useState<Tender>({ digits: "", exactCents: null })
  const [rxSeen, setRxSeen] = useState(false)
  const [tillCode, setTillCode] = useState("")
  const [tillError, setTillError] = useState<string | null>(null)

  const rxOk = !rx.required || rxSeen
  const tendered = tenderCents(tender)
  const change = changeCents(tendered, total)

  const methods: MethodOption[] = OFFLINE_EDITION
    ? [{ id: "cash", label: "Cash" }]
    : [
        { id: "cash", label: "Cash" },
        ...(p.mpesaOffered ? [{ id: "mpesa" as const, label: "M-Pesa", disabled: !p.isOnline }] : []),
        { id: "till", label: "Till/Paybill" },
        ...(p.mpesaOffered ? [{ id: "split" as const, label: "Split", disabled: !p.isOnline }] : []),
      ]

  function recordTill() {
    const code = tillCode.trim().toUpperCase()
    if (code && !MPESA_CODE_RE.test(code)) {
      setTillError("M-Pesa codes are 10 letters/numbers — or leave it blank")
      return
    }
    setTillError(null)
    return p.onTill(code || null)
  }

  const cashReady = tendered >= total && total > 0 && rxOk
  // Say why "Complete sale" is greyed right next to it, not only at the top.
  const cashHint = !rxOk ? RX_HINT : total > 0 && tendered < total ? `Enter the cash received — at least ${formatKES(total)}.` : null
  const footer =
    method === "cash" ? (
      <View style={styles.footer}>
        {cashHint && !p.committing ? (
          <Text variant="caption" tone={!rxOk ? "warning" : "secondary"} align="center" accessibilityLiveRegion="polite">
            {cashHint}
          </Text>
        ) : null}
        <Button
          title={cashReady ? `Complete · change ${formatKES(Math.max(0, change))}` : "Complete sale"}
          size="lg"
          onPress={() => p.onCash(tendered)}
          loading={p.committing}
          disabled={!cashReady}
          accessibilityHint={cashHint ?? undefined}
          leadingIcon={<Ionicons name="checkmark-circle" size={22} color={theme.onAccent} />}
        />
      </View>
    ) : undefined

  return (
    <Sheet open={p.open} onClose={p.onClose} title="Payment" snapPoints={["94%"]} scrollable footer={footer}>
      <View style={styles.totalBox}>
        <Text variant="label" tone="secondary" align="center">
          Total to pay
        </Text>
        <Text variant="display" align="center" tabular accessibilityRole="header">
          {formatKES(total)}
        </Text>
      </View>

      {rx.required ? (
        <PressableScale
          onPress={() => setRxSeen((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rxSeen }}
          accessibilityLabel="Prescription seen"
          style={[styles.rxBox, { borderColor: rxSeen ? theme.green : theme.amber, backgroundColor: rxSeen ? theme.green50 : theme.surface }]}
        >
          <Ionicons name={rxSeen ? "checkbox" : "square-outline"} size={28} color={rxSeen ? theme.green600 : theme.amber} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Prescription seen</Text>
            <Text variant="caption" tone="secondary">
              {rx.controlled
                ? "This sale has controlled items — they are logged in the PPB controlled-substances register under your name."
                : "This sale has prescription-only items. Check the prescription before taking payment."}
            </Text>
          </View>
        </PressableScale>
      ) : null}

      {methods.length > 1 ? <MethodTabs methods={methods} value={method} onChange={setMethod} /> : null}
      {!OFFLINE_EDITION && p.mpesaOffered && !p.isOnline ? (
        <Text variant="caption" tone="warning">
          M-Pesa prompts and Split need internet — use Till/Paybill for M-Pesa paid to the shop.
        </Text>
      ) : null}
      {!OFFLINE_EDITION && !p.mpesaOffered && p.mpesaNote ? (
        <Text variant="caption" tone="secondary">
          {p.mpesaNote}
        </Text>
      ) : null}

      {/* Sections cross-fade when the method changes. */}
      {method === "cash" ? (
        <Animated.View key="cash" entering={m.fadeIn} exiting={m.fadeOut}>
          <CashEntry total={total} tender={tender} onTender={setTender} label="Cash received" />
        </Animated.View>
      ) : null}

      {method === "till" ? (
        <Animated.View key="till" entering={m.fadeIn} exiting={m.fadeOut} style={styles.section}>
          <Text variant="body">
            M-Pesa paid to the shop&apos;s till/paybill · <Text variant="bodyStrong">{formatKES(total)}</Text>
          </Text>
          <TextField
            label="M-Pesa code (optional)"
            inSheet
            placeholder="e.g. QJK4XXXXXX"
            autoCapitalize="characters"
            maxLength={10}
            value={tillCode}
            onChangeText={(v) => setTillCode(v.toUpperCase().slice(0, 10))}
            error={tillError}
            helper="Check the customer's M-Pesa message first. The owner verifies these later."
          />
          {!rxOk ? (
            <Text variant="caption" tone="warning" align="center">
              {RX_HINT}
            </Text>
          ) : null}
          <Button title="Record M-Pesa payment" size="lg" onPress={recordTill} loading={p.committing} disabled={!rxOk} accessibilityHint={rxOk ? undefined : RX_HINT} />
        </Animated.View>
      ) : null}

      {/* isOnline only gates which methods are SELECTABLE — once a flow is
          active a mid-flow disconnect doesn't tear it down ("Confirm
          received" / manual code need no network). */}
      {method === "mpesa" ? (
        <Animated.View key="mpesa" entering={m.fadeIn} exiting={m.fadeOut}>
          {rxOk ? <MpesaFlow amountCents={total} onConfirmed={p.onMpesa} committing={p.committing} inSheet /> : <Text tone="warning">Tick “Prescription seen” first.</Text>}
        </Animated.View>
      ) : null}

      {method === "split" ? (
        <Animated.View key="split" entering={m.fadeIn} exiting={m.fadeOut}>
          <SplitEntry total={total} rxOk={rxOk} committing={p.committing} onConfirmed={p.onSplit} />
        </Animated.View>
      ) : null}

      {p.error ? (
        <Animated.View entering={m.riseIn}>
          <Text tone="danger" accessibilityLiveRegion="assertive">
            {p.error}
          </Text>
        </Animated.View>
      ) : null}
    </Sheet>
  )
}

type MethodOption = { id: Method; label: string; disabled?: boolean }

const TABS_PAD = 4

/**
 * Payment-method picker: equal segments with a selection pill that slides
 * (translateX on the UI thread, critically damped) to the chosen method.
 */
function MethodTabs({ methods, value, onChange }: { methods: MethodOption[]; value: Method; onChange: (m: Method) => void }) {
  const theme = useTheme()
  const motionApi = useMotion()
  const [width, setWidth] = useState(0)
  const segW = width > 0 ? (width - TABS_PAD * 2) / methods.length : 0
  const index = Math.max(0, methods.findIndex((m) => m.id === value))
  const x = useSharedValue(0)
  const placed = useRef(false)
  useEffect(() => {
    if (segW <= 0) return
    if (!placed.current) {
      placed.current = true
      x.value = index * segW
      return
    }
    x.value = motionApi.spring(index * segW, "snappy")
  }, [index, segW, x, motionApi])
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))

  return (
    <View
      style={[styles.tabs, { backgroundColor: theme.mutedStrong }]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Payment method"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { width: segW, backgroundColor: theme.surface, borderColor: theme.green }, pill]}
        />
      ) : null}
      {methods.map((m) => {
        const selected = m.id === value
        return (
          <PressableScale
            key={m.id}
            onPress={() => onChange(m.id)}
            disabled={m.disabled}
            haptic="tick"
            accessibilityRole="radio"
            accessibilityLabel={m.label}
            accessibilityState={{ selected, disabled: !!m.disabled }}
            style={[styles.tab, m.disabled && styles.tabDisabled]}
          >
            <Text
              variant="label"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ color: selected ? theme.green600 : theme.textSecondary }}
            >
              {m.label}
            </Text>
          </PressableScale>
        )
      })}
    </View>
  )
}

function CashEntry({ total, tender, onTender, label }: { total: number; tender: Tender; onTender: (t: Tender) => void; label: string }) {
  const theme = useTheme()
  const m = useMotion()
  const tendered = tenderCents(tender)
  const change = changeCents(tendered, total)
  const options = quickCashOptions(total)
  // Change (green) ↔ short (red) colour glides instead of flipping.
  const enough = useSharedValue(change >= 0 ? 1 : 0)
  useEffect(() => {
    enough.value = m.timing(change >= 0 ? 1 : 0, "fast")
  }, [change, enough, m])
  const changeColor = useAnimatedStyle(() => ({ color: interpolateColor(enough.value, [0, 1], [theme.red, theme.green600]) }))
  return (
    <View style={styles.section}>
      <View style={styles.tenderRow}>
        <View>
          <Text variant="caption" tone="secondary">
            {label}
          </Text>
          <Text variant="title" tabular>
            {formatKES(tendered)}
          </Text>
        </View>
        {tendered > 0 ? (
          <Animated.View entering={m.fadeIn} style={styles.changeCol} accessibilityLiveRegion="polite">
            <Text variant="caption" tone="secondary">
              {change >= 0 ? "Change" : "Short by"}
            </Text>
            {/* Rolls when a quick-cash amount is tapped; tracks every key while typing. */}
            <AnimatedNumber
              value={Math.abs(change)}
              format={formatKES}
              variant="title"
              animate={tender.exactCents !== null}
              animatedStyle={changeColor}
              accessibilityLabel={`${change >= 0 ? "Change" : "Short by"} ${formatKES(Math.abs(change))}`}
            />
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.quick}>
        {options.map((c, i) => (
          <Chip
            key={c}
            label={i === 0 ? `Exact ${formatKES(c)}` : formatKES(c)}
            selected={tender.exactCents === c}
            onPress={() => onTender({ digits: "", exactCents: c })}
          />
        ))}
      </View>
      <NumericKeypad value={tender.digits} onChange={(digits) => onTender({ digits, exactCents: null })} />
    </View>
  )
}

function SplitEntry({
  total, rxOk, committing, onConfirmed,
}: { total: number; rxOk: boolean; committing: boolean; onConfirmed: PaymentSheetProps["onSplit"] }) {
  const [digits, setDigits] = useState("")
  const cash = keypadNumber(digits) * 100
  const mpesa = total - cash
  const ready = cash > 0 && mpesa > 0
  return (
    <View style={styles.section}>
      <View style={styles.tenderRow}>
        <View>
          <Text variant="caption" tone="secondary">
            Cash part
          </Text>
          <Text variant="title" tabular>
            {formatKES(cash)}
          </Text>
        </View>
        <View style={styles.changeCol}>
          <Text variant="caption" tone="secondary">
            M-Pesa part
          </Text>
          <Text variant="title" tone={mpesa > 0 ? "default" : "danger"} tabular>
            {formatKES(Math.max(0, mpesa))}
          </Text>
        </View>
      </View>
      <NumericKeypad value={digits} onChange={setDigits} />
      {cash >= total ? <Text tone="danger">The cash part must be less than the total — use Cash instead.</Text> : null}
      {ready && !rxOk ? <Text tone="warning">Tick “Prescription seen” first.</Text> : null}
      {ready && rxOk ? <MpesaFlow amountCents={mpesa} onConfirmed={(ref) => onConfirmed(cash, mpesa, ref)} committing={committing} inSheet /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { gap: space.xs },
  totalBox: { paddingVertical: space.sm, gap: space.xxs },
  rxBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: space.md,
    minHeight: TOUCH_TARGET,
  },
  tabs: { flexDirection: "row", padding: TABS_PAD, borderRadius: radius.lg, minHeight: TOUCH_TARGET + TABS_PAD * 2 },
  pill: { position: "absolute", top: TABS_PAD, bottom: TABS_PAD, left: TABS_PAD, borderRadius: radius.md, borderWidth: 1.5 },
  tab: { flex: 1, minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xs },
  tabDisabled: { opacity: 0.4 },
  section: { gap: space.md },
  tenderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  changeCol: { alignItems: "flex-end" },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
})
