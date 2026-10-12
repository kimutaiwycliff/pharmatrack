import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useState } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { Button, Chip, MpesaFlow, NumericKeypad, Sheet, Text, TextField } from "../../../components"
import { env } from "../../../lib/env"
import { keypadNumber } from "../../../lib/keypad"
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
  /** Tenant plan + config allow STK push (fetched once by the POS). */
  mpesaOffered: boolean
  isOnline: boolean
  committing: boolean
  error: string | null
  onCash: (tenderedCents: number) => void
  onMpesa: (reference: string | null) => void
  onTill: (code: string | null) => void
  onSplit: (cashCents: number, mpesaCents: number, reference: string | null) => void
}

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

  const methods: { id: Method; label: string; disabled?: boolean }[] = OFFLINE_EDITION
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
    p.onTill(code || null)
  }

  const cashReady = tendered >= total && total > 0 && rxOk
  const footer =
    method === "cash" ? (
      <Button
        title={cashReady ? `Complete · change ${formatKES(Math.max(0, change))}` : "Complete sale"}
        size="lg"
        onPress={() => p.onCash(tendered)}
        loading={p.committing}
        disabled={!cashReady}
        leadingIcon={<Ionicons name="checkmark-circle" size={22} color={theme.onAccent} />}
      />
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
        <Pressable
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
        </Pressable>
      ) : null}

      {methods.length > 1 ? (
        <View style={styles.methods} accessibilityRole="radiogroup">
          {methods.map((m) => (
            <Chip
              key={m.id}
              label={m.label}
              selected={method === m.id}
              disabled={m.disabled}
              onPress={() => setMethod(m.id)}
              style={styles.methodChip}
            />
          ))}
        </View>
      ) : null}
      {!OFFLINE_EDITION && p.mpesaOffered && !p.isOnline ? (
        <Text variant="caption" tone="warning">
          M-Pesa prompts and Split need internet — use Till/Paybill for M-Pesa paid to the shop.
        </Text>
      ) : null}

      {method === "cash" ? (
        <CashEntry total={total} tender={tender} onTender={setTender} label="Cash received" />
      ) : null}

      {method === "till" ? (
        <View style={styles.section}>
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
          <Button title="Record M-Pesa payment" size="lg" onPress={recordTill} loading={p.committing} disabled={!rxOk} />
        </View>
      ) : null}

      {/* isOnline only gates which methods are SELECTABLE — once a flow is
          active a mid-flow disconnect doesn't tear it down ("Confirm
          received" / manual code need no network). */}
      {method === "mpesa" ? (
        rxOk ? (
          <MpesaFlow amountCents={total} onConfirmed={p.onMpesa} inSheet />
        ) : (
          <Text tone="warning">Tick “Prescription seen” first.</Text>
        )
      ) : null}

      {method === "split" ? <SplitEntry total={total} rxOk={rxOk} onConfirmed={p.onSplit} /> : null}

      {p.error ? (
        <Text tone="danger" accessibilityLiveRegion="assertive">
          {p.error}
        </Text>
      ) : null}
    </Sheet>
  )
}

function CashEntry({ total, tender, onTender, label }: { total: number; tender: Tender; onTender: (t: Tender) => void; label: string }) {
  const tendered = tenderCents(tender)
  const change = changeCents(tendered, total)
  const options = quickCashOptions(total)
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
          <View style={styles.changeCol} accessibilityLiveRegion="polite">
            <Text variant="caption" tone="secondary">
              {change >= 0 ? "Change" : "Short by"}
            </Text>
            <Text variant="title" tone={change >= 0 ? "success" : "danger"} tabular>
              {formatKES(Math.abs(change))}
            </Text>
          </View>
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

function SplitEntry({ total, rxOk, onConfirmed }: { total: number; rxOk: boolean; onConfirmed: PaymentSheetProps["onSplit"] }) {
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
      {ready && rxOk ? <MpesaFlow amountCents={mpesa} onConfirmed={(ref) => onConfirmed(cash, mpesa, ref)} inSheet /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  methods: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  methodChip: { flexGrow: 1, justifyContent: "center" },
  section: { gap: space.md },
  tenderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  changeCol: { alignItems: "flex-end" },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
})
