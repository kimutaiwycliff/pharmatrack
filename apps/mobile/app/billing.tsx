import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native"
import * as WebBrowser from "expo-web-browser"
import { apiFetch } from "../src/lib/api-fetch"
import { toast } from "../src/lib/toast"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, PaymentClaimBox, Screen, ScreenHeader, StatusBadge } from "../src/components"
import type { BadgeStatus } from "../src/components"

// Mirrors apps/web/components/settings/BillingPanel.tsx: subscription status,
// plan, trial/paid-until dates, payment history, and (reused from
// SubscriptionGate) the same M-Pesa "I've paid" claim box, so an owner can
// proactively pay/check status before ever being locked out, not just after.

interface Plan { name: string; price_kes: number; interval: string }
interface Subscription { status: string; current_period_end: string | null; trial_ends_at: string | null; plan: Plan | null }
interface Payment { id: string; amount_kes: number; method: string | null; reference: string | null; created_at: string; status: string }
interface BillingData { subscription: Subscription | null; payments: Payment[]; paystackEnabled: boolean; paymentNumber: string | null }

const STATUS_BADGE: Record<string, BadgeStatus> = {
  trialing: "ok",
  active: "ok",
  past_due: "warning",
  suspended: "danger",
  cancelled: "neutral",
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "—"
}

export default function Billing() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    apiFetch("/api/billing")
      .then((r) => (r.ok ? (r.json() as Promise<BillingData>) : Promise.reject(new Error("Failed to load"))))
      .then(setData)
      .catch(() => toast.error("Could not load billing details"))
      .finally(() => setLoading(false))
  }, [])

  async function payOnline() {
    setPaying(true)
    try {
      const res = await apiFetch("/api/billing/checkout", { method: "POST" })
      const json = (await res.json()) as { authorization_url?: string; error?: string }
      if (!res.ok || !json.authorization_url) throw new Error(json.error ?? "Could not start payment")
      await WebBrowser.openBrowserAsync(json.authorization_url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setPaying(false)
    }
  }

  if (loading || !data) {
    return (
      <Screen>
        <ScreenHeader title="Billing" />
        <View style={styles.centered}><ActivityIndicator color={theme.green} /></View>
      </Screen>
    )
  }

  const sub = data.subscription
  const status = sub?.status ?? "none"

  return (
    <Screen>
      <ScreenHeader title="Billing" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.planName}>{sub?.plan?.name ?? "No plan"}</Text>
              {sub?.plan && (
                <Text style={styles.planPrice}>KES {Number(sub.plan.price_kes).toLocaleString()} / {sub.plan.interval}</Text>
              )}
            </View>
            <StatusBadge status={STATUS_BADGE[status] ?? "neutral"} label={status.replace("_", " ")} />
          </View>

          <View style={styles.datesRow}>
            <View style={styles.dateBlock}>
              <Text style={styles.dateLabel}>Paid until</Text>
              <Text style={styles.dateValue}>{fmt(sub?.current_period_end ?? null)}</Text>
            </View>
            {sub?.trial_ends_at && (
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>Trial ends</Text>
                <Text style={styles.dateValue}>{fmt(sub.trial_ends_at)}</Text>
              </View>
            )}
          </View>

          {data.paystackEnabled && (
            <Button
              title={status === "active" ? "Renew now" : "Pay & activate"}
              onPress={payOnline}
              loading={paying}
              style={styles.payButton}
            />
          )}

          {data.paymentNumber && <PaymentClaimBox />}
        </Card>

        {data.payments.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Payment history</Text>
            {data.payments.map((p, i) => (
              <View key={p.id} style={[styles.paymentRow, i > 0 && styles.paymentRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentAmount}>KES {Number(p.amount_kes).toLocaleString()}</Text>
                  <Text style={styles.paymentMeta}>{p.reference ?? p.method ?? "—"} · {fmt(p.created_at)}</Text>
                </View>
                <StatusBadge
                  status={p.status === "confirmed" ? "ok" : p.status === "pending" ? "warning" : "danger"}
                  label={p.status}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    scrollContent: { gap: 12, paddingBottom: 24 },
    card: { gap: 14 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    planName: { fontSize: 15, fontWeight: "700", color: theme.text },
    planPrice: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    datesRow: { flexDirection: "row", gap: 24 },
    dateBlock: { gap: 2 },
    dateLabel: { fontSize: 11, fontWeight: "600", color: theme.textTertiary, textTransform: "uppercase" },
    dateValue: { fontSize: 14, fontWeight: "600", color: theme.text },
    payButton: { alignSelf: "flex-start", paddingHorizontal: 20 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: theme.textSecondary, textTransform: "uppercase" },
    paymentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 10 },
    paymentRowBorder: { borderTopWidth: 1, borderTopColor: theme.border },
    paymentAmount: { fontSize: 14, fontWeight: "600", color: theme.text },
    paymentMeta: { fontSize: 12, color: theme.textTertiary, marginTop: 2 },
  })
}
