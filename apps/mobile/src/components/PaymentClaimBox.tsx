import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiFetch } from "../lib/api-fetch"
import { toast } from "../lib/toast"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"
import { Button } from "./Button"

// Mirrors apps/web/components/billing/PaymentClaimBox.tsx: an owner who is
// ALREADY locked out by SubscriptionGate still needs a way to self-report a
// manual M-Pesa payment, since Settings/Billing (where this also renders,
// see app/billing.tsx) is unreachable once the whole app is gated. Reads
// GET /api/billing, posts to POST /api/billing/claim-payment — same routes
// web uses, both allowInactiveSubscription so they work while blocked.

interface BillingData {
  subscription: { plan: { price_kes: number } | null } | null
  payments: { id: string; amount_kes: number; reference: string | null; status: string; created_at: string }[]
  paymentNumber: string | null
}

export function PaymentClaimBox() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reference, setReference] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch("/api/billing")
      .then((r) => (r.ok ? (r.json() as Promise<BillingData>) : null))
      .then((json) => { if (!cancelled) setData(json) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function submit() {
    if (!reference.trim()) { toast.error("Enter the M-Pesa confirmation code"); return }
    setSubmitting(true)
    try {
      const res = await apiFetch("/api/billing/claim-payment", {
        method: "POST",
        body: JSON.stringify({ reference: reference.trim() }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Could not submit payment")
      setJustSubmitted(true)
      setReference("")
      toast.success("Thanks! We'll confirm and activate your subscription shortly.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={theme.textSecondary} size="small" />
        <Text style={styles.loadingText}>Loading payment details…</Text>
      </View>
    )
  }
  if (!data?.paymentNumber) return null

  const pending = data.payments.find((p) => p.status === "pending")
  const price = data.subscription?.plan?.price_kes

  return (
    <View style={styles.box}>
      <View style={styles.headerRow}>
        <Ionicons name="phone-portrait-outline" size={14} color={theme.textSecondary} />
        <Text style={styles.headerText}>Pay via M-Pesa to reactivate</Text>
      </View>

      {pending || justSubmitted ? (
        <View style={styles.pendingRow}>
          <Ionicons name="time-outline" size={16} color={theme.amber} />
          <Text style={styles.pendingText}>
            {justSubmitted
              ? "Thanks — we'll verify and reactivate your subscription shortly."
              : `Payment awaiting confirmation${pending?.reference ? ` (ref ${pending.reference})` : ""}. We'll reactivate once it's verified.`}
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.copy}>
            Send {price ? `KES ${Number(price).toLocaleString()}` : "your subscription fee"} via M-Pesa to{" "}
            <Text style={styles.bold}>{data.paymentNumber}</Text>, then enter the confirmation code below.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. QFT7X2ABCD"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="characters"
            value={reference}
            onChangeText={setReference}
          />
          <Button title="I've paid" onPress={submit} loading={submitting} icon={<Ionicons name="checkmark-circle-outline" size={16} color="#fff" />} />
        </>
      )}
    </View>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 20 },
    loadingText: { fontSize: 12, color: theme.textSecondary },
    box: {
      width: "100%",
      marginTop: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.muted,
      padding: 14,
      gap: 10,
    },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    headerText: { fontSize: 12, fontWeight: "700", color: theme.textSecondary, textTransform: "uppercase" },
    copy: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
    bold: { fontWeight: "700", color: theme.text },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    pendingRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    pendingText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  })
}
