import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { toCents, formatKES } from "@pharmatrack/core"
import { apiJson, errorMessage } from "../lib/api"
import { toast } from "../lib/toast"
import { useTheme } from "../theme/useTheme"
import { radius, space } from "../theme/tokens"
import { Button } from "./Button"
import { Text } from "./Text"
import { TextField } from "./TextField"

// Mirrors apps/web/components/billing/PaymentClaimBox.tsx: an owner who is
// ALREADY locked out by SubscriptionGate still needs a way to self-report a
// manual M-Pesa payment, since Settings/Billing (where this also renders,
// see app/billing.tsx) is unreachable once the whole app is gated. Reads
// GET /api/billing, posts to POST /api/billing/claim-payment — same routes
// web uses, both allowInactiveSubscription so they work while blocked.
// Renders nothing when the platform has no payment number configured.

interface BillingData {
  subscription: { plan: { price_kes: number } | null } | null
  payments: { id: string; amount_kes: number; reference: string | null; status: string; created_at: string }[]
  paymentNumber: string | null
}

interface PaymentClaimBoxProps {
  /** "gate" (default) = locked-out copy; "billing" = the Billing screen's. */
  context?: "gate" | "billing"
  /** Called after a claim is accepted (e.g. to refresh payment history). */
  onClaimed?: () => void
}

export function PaymentClaimBox({ context = "gate", onClaimed }: PaymentClaimBoxProps = {}) {
  const theme = useTheme()
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reference, setReference] = useState("")
  const [refError, setRefError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiJson<BillingData>("/api/billing")
      .then((json) => { if (!cancelled) setData(json) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function submit() {
    const ref = reference.trim()
    // Same rule as the route's Zod schema (min 4, max 40).
    if (ref.length < 4) { setRefError("Enter the M-Pesa confirmation code"); return }
    setRefError(null)
    setSubmitting(true)
    try {
      await apiJson("/api/billing/claim-payment", { method: "POST", body: { reference: ref } })
      setJustSubmitted(true)
      setReference("")
      toast.success("Thanks! We'll confirm and activate your subscription shortly.")
      onClaimed?.()
    } catch (err) {
      setRefError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingRow} accessibilityRole="progressbar" accessibilityLabel="Loading payment details">
        <ActivityIndicator color={theme.textSecondary} size="small" />
        <Text variant="caption" tone="secondary">
          Loading payment details…
        </Text>
      </View>
    )
  }
  if (!data?.paymentNumber) return null

  const pending = data.payments.find((p) => p.status === "pending")
  const price = data.subscription?.plan?.price_kes
  const amount = price ? formatKES(toCents(price)) : "your subscription fee"

  return (
    <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.muted }]}>
      <View style={styles.headerRow}>
        <Ionicons name="phone-portrait-outline" size={16} color={theme.textSecondary} />
        <Text variant="label" tone="secondary" style={styles.headerText} accessibilityRole="header">
          {context === "billing" ? "Pay via M-Pesa" : "Pay via M-Pesa to reactivate"}
        </Text>
      </View>

      {pending || justSubmitted ? (
        <View style={styles.pendingRow} accessibilityLiveRegion="polite">
          <Ionicons name="time-outline" size={18} color={theme.amber} />
          <Text variant="caption" tone="secondary" style={styles.flex}>
            {justSubmitted && !pending
              ? "Thanks — we'll verify and reactivate your subscription shortly."
              : `Payment awaiting confirmation${pending?.reference ? ` (ref ${pending.reference})` : ""}. We'll reactivate once it's verified.`}
          </Text>
        </View>
      ) : (
        <>
          <Text tone="secondary">
            Send <Text variant="bodyStrong">{amount}</Text> via M-Pesa to{" "}
            <Text variant="bodyStrong" tabular>
              {data.paymentNumber}
            </Text>
            , then enter the confirmation code below.
          </Text>
          <TextField
            label="M-Pesa confirmation code"
            placeholder="e.g. QFT7X2ABCD"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            value={reference}
            onChangeText={(v) => {
              setReference(v)
              if (refError) setRefError(null)
            }}
            error={refError}
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Button
            title="I've paid"
            onPress={submit}
            loading={submitting}
            leadingIcon={<Ionicons name="checkmark-circle-outline" size={18} color={theme.onAccent} />}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "center", marginTop: space.lg, minHeight: 48 },
  box: { width: "100%", marginTop: space.lg, borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  headerText: { textTransform: "uppercase", letterSpacing: 0.5 },
  pendingRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
})
