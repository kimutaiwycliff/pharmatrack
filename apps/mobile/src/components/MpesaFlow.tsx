import { useEffect, useState } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES, fromCents, type Cents } from "@pharmatrack/core"
import { sendStkPush } from "../lib/mpesa"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"

const CODE_RE = /^[A-Z0-9]{10}$/i
const WAIT_SECONDS = 60

type Phase = "phone" | "waiting" | "manual"

interface MpesaFlowProps {
  // Decimal-KES amount to request via STK push, expressed as integer cents
  // (ADR-008) — the full sale total for a pure M-Pesa sale, or just the
  // M-Pesa portion for a Split sale. Converted to decimal only at the API
  // boundary (POST /api/mpesa), never floated in between.
  amountCents: Cents
  onConfirmed: (mpesaReference: string | null) => void
}

// Reusable STK-push + manual-confirm flow shared by the pure "M-Pesa" payment
// method and the M-Pesa portion of "Split" — mirrors
// apps/web/components/pos/MpesaModal.tsx's real behavior:
//
//  - "waiting" is a client-side-only 60s countdown (setInterval). Nothing
//    server-side ever confirms the STK push — there is no status-polling
//    endpoint — so the cashier must eventually attest completion themselves
//    ("Confirm received") or key in the M-Pesa code by hand ("Enter code
//    manually"). This is intentional, matching real-world till behavior, not
//    a shortcut.
//  - "Resend" re-fires the same POST /api/mpesa call with the same phone/amount.
//  - The M-Pesa code is always optional; a non-empty value must match
//    /^[A-Z0-9]{10}$/i or the confirm action is blocked (verified directly
//    against apps/web/components/pos/MpesaModal.tsx's `disabled={codeBlocks}`).
export function MpesaFlow({ amountCents, onConfirmed }: MpesaFlowProps) {
  const theme = useTheme()
  const styles = createStyles(theme)

  const [phase, setPhase] = useState<Phase>("phone")
  const [returnPhase, setReturnPhase] = useState<"phone" | "waiting">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [timer, setTimer] = useState(WAIT_SECONDS)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cosmetic countdown only — reaching 0 does nothing (no auto-fail,
  // nothing is blocked), same as the web modal.
  useEffect(() => {
    if (phase !== "waiting") return
    const id = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(id)
  }, [phase])

  const amount = Number(fromCents(amountCents))
  const trimmedCode = code.trim()
  const codeValid = CODE_RE.test(trimmedCode)
  const codeBlocks = trimmedCode.length > 0 && !codeValid

  async function send() {
    setError(null)
    setSending(true)
    const result = await sendStkPush(phone, amount)
    setSending(false)
    if (!result.ok) {
      setError(result.error ?? "Could not send the M-Pesa prompt. Check the number and try again.")
      return
    }
    setTimer(WAIT_SECONDS)
    setPhase("waiting")
  }

  function enterManual(from: "phone" | "waiting") {
    setReturnPhase(from)
    setError(null)
    setPhase("manual")
  }

  return (
    <Card style={styles.card}>
      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>M-Pesa amount</Text>
        <Text style={styles.amountValue}>{formatKES(amountCents)}</Text>
      </View>

      {phase === "phone" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Customer phone (e.g. 07XXXXXXXX)"
            placeholderTextColor={theme.textTertiary}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title={sending ? "Sending…" : "Send STK push"}
            onPress={send}
            loading={sending}
            disabled={phone.replace(/\D/g, "").length < 9}
            icon={<Ionicons name="call-outline" size={18} color="#fff" />}
          />
          <Button
            title="Enter code manually instead"
            variant="secondary"
            onPress={() => enterManual("phone")}
            icon={<Ionicons name="create-outline" size={18} color={theme.text} />}
          />
        </>
      ) : null}

      {phase === "waiting" ? (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingTitle}>Request sent to {phone}</Text>
          <Text style={styles.waitingSubtitle}>Ask the customer to enter their M-Pesa PIN</Text>
          <Text style={styles.timer}>Waiting · 0:{String(timer).padStart(2, "0")} remaining</Text>
          <View style={styles.waitingActions}>
            <Button
              title="Resend"
              variant="secondary"
              onPress={send}
              loading={sending}
              icon={<Ionicons name="refresh-outline" size={16} color={theme.text} />}
            />
            <Button title="Enter code manually" variant="secondary" onPress={() => enterManual("waiting")} />
            <Button
              title="Confirm received"
              onPress={() => onConfirmed(null)}
              icon={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}

      {phase === "manual" ? (
        <>
          <Text style={styles.hint}>
            Use this when the customer paid via Pay Bill or Send Money on their own. The code is
            optional — confirm once you have seen the payment.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="M-Pesa code (optional)"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="characters"
            maxLength={10}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase().slice(0, 10))}
          />
          {codeBlocks ? <Text style={styles.error}>Must be 10 characters — or leave it blank</Text> : null}
          <Button
            title={trimmedCode ? "Confirm payment" : "Confirm — customer paid"}
            onPress={() => onConfirmed(trimmedCode || null)}
            disabled={codeBlocks}
            icon={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
          />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => setPhase(returnPhase)}
            icon={<Ionicons name="arrow-back-outline" size={18} color={theme.text} />}
          />
        </>
      ) : null}
    </Card>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: { gap: 10 },
    amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    amountLabel: { fontSize: 13, color: theme.textSecondary },
    amountValue: { fontSize: 18, fontWeight: "700", color: theme.text },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    waitingBox: {
      backgroundColor: theme.green50,
      borderColor: theme.green100,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      gap: 8,
      alignItems: "center",
    },
    waitingTitle: { fontWeight: "700", color: theme.text, textAlign: "center" },
    waitingSubtitle: { fontSize: 13, color: theme.textSecondary, textAlign: "center" },
    timer: { fontWeight: "600", color: theme.green600, fontSize: 13 },
    waitingActions: { gap: 8, width: "100%" },
    hint: { fontSize: 12, color: theme.textSecondary },
    error: { color: theme.red, fontSize: 13 },
  })
}
