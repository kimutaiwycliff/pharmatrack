import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import * as WebBrowser from "expo-web-browser"
import { toCents } from "@pharmatrack/core"
import {
  Button, EmptyState, ErrorState, ListRow, Money, NeedsInternet, PaymentClaimBox, Screen, ScreenHeader,
  SkeletonCards, SkeletonList, StatusBadge, Text, useIsOnline,
} from "../src/components"
import { SettingsSection } from "../src/features/settings/components/SettingsSection"
import {
  effectiveStatus, intervalLabel, paymentBadge, renewalInfo, subscriptionBadge, type BillingData,
} from "../src/features/settings/logic/billing"
import { useCan } from "../src/hooks/useCan"
import { useApiQuery } from "../src/hooks/useQuery"
import { apiJson, errorMessage } from "../src/lib/api"
import { formatDay } from "../src/lib/dates"
import { toast } from "../src/lib/toast"
import { useTheme } from "../src/theme/useTheme"
import { radius, space } from "../src/theme/tokens"

// Mirrors apps/web/components/settings/BillingPanel.tsx: subscription status
// (the server's effective status), plan, trial / paid-until date with a
// countdown, Paystack checkout, payment history, and (shared with
// SubscriptionGate) the M-Pesa "I've paid" claim box, so an owner can pay or
// check status before ever being locked out. Online only (capability
// billing.manage; hidden from the Offline Edition's menu).

export default function Billing() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  let body
  if (!can("billing.manage")) {
    body = (
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
        message="Only the pharmacy owner can manage billing."
      />
    )
  } else if (!online) body = <NeedsInternet feature="Billing" />
  else body = <BillingBody />
  return (
    <Screen>
      <ScreenHeader title="Billing" />
      {body}
    </Screen>
  )
}

function BillingBody() {
  const theme = useTheme()
  const q = useApiQuery<BillingData>("/api/billing")
  const [paying, setPaying] = useState(false)
  // Remounts the claim box after a pull-to-refresh so it re-reads too.
  const [claimKey, setClaimKey] = useState(0)

  async function payOnline() {
    setPaying(true)
    try {
      const json = await apiJson<{ authorization_url?: string }>("/api/billing/checkout", { method: "POST" })
      if (!json.authorization_url) throw new Error("Could not start payment")
      await WebBrowser.openBrowserAsync(json.authorization_url)
      // Back from the browser — the webhook may have activated the plan.
      q.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPaying(false)
    }
  }

  if (q.loading) {
    return (
      <View style={styles.skeleton}>
        <SkeletonCards count={2} />
        <SkeletonList rows={3} />
      </View>
    )
  }
  if (!q.data) return <ErrorState message={q.error ?? "Could not load billing details"} onRetry={q.retry} />

  const data = q.data
  const sub = data.subscription
  const status = effectiveStatus(sub)
  const badge = subscriptionBadge(status)
  const renewal = renewalInfo(sub)

  return (
    // FormScroll's KeyboardAvoidingView, inline here to keep pull-to-refresh.
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={() => {
              q.refresh()
              setClaimKey((k) => k + 1)
            }}
            tintColor={theme.green}
            colors={[theme.green]}
          />
        }
      >
        {q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.planRow}>
            <View style={styles.flex}>
              <Text variant="label" tone="secondary">
                Plan
              </Text>
              <Text variant="headline">{sub?.plan?.name ?? "No plan"}</Text>
              {sub?.plan ? (
                <Text tone="secondary">
                  <Money cents={toCents(sub.plan.price_kes)} variant="body" tone="secondary" /> / {intervalLabel(sub.plan.interval)}
                </Text>
              ) : null}
            </View>
            <StatusBadge status={badge.tone} label={badge.label} />
          </View>

          <View style={[styles.datesRow, { borderTopColor: theme.border }]}>
            <View style={styles.flex}>
              <Text variant="caption" tone="tertiary">
                {renewal.label}
              </Text>
              <Text variant="bodyStrong" tabular>
                {renewal.date ? formatDay(renewal.date) : "—"}
              </Text>
            </View>
            {renewal.countdown ? (
              <View style={styles.flex}>
                <Text variant="caption" tone="tertiary">
                  Next renewal
                </Text>
                <Text variant="bodyStrong" tone={renewal.soon ? "warning" : "default"}>
                  {renewal.countdown}
                </Text>
              </View>
            ) : null}
          </View>

          {data.paystackEnabled ? (
            <Button
              title={status === "active" ? "Renew now" : "Pay & activate"}
              onPress={payOnline}
              loading={paying}
              leadingIcon={<Ionicons name="card-outline" size={18} color={theme.onAccent} />}
              accessibilityHint="Opens secure card / M-Pesa checkout in the browser"
            />
          ) : null}
        </View>

        {data.paymentNumber ? <PaymentClaimBox key={claimKey} context="billing" onClaimed={q.refresh} /> : null}

        <SettingsSection title="Payments">
          {data.payments.length === 0 ? (
            <View style={styles.emptyPayments}>
              <Text tone="tertiary">No payments yet</Text>
            </View>
          ) : (
            data.payments.map((p) => {
              const pb = paymentBadge(p.status)
              const covers = p.status === "confirmed" && p.period_end ? ` · covers to ${formatDay(p.period_end)}` : ""
              return (
                <ListRow
                  key={p.id}
                  title={`${formatDay(p.created_at)}`}
                  subtitle={`${p.method ?? "—"}${p.reference ? ` · ${p.reference}` : ""}${covers}`}
                  leading={
                    <View style={[styles.payIcon, { backgroundColor: theme.mutedStrong }]}>
                      <Ionicons name="receipt-outline" size={18} color={theme.textSecondary} />
                    </View>
                  }
                  meta={<StatusBadge status={pb.tone} label={pb.label} />}
                  trailing={<Money cents={toCents(p.amount_kes)} />}
                  accessibilityLabel={`Payment of KES ${p.amount_kes} on ${formatDay(p.created_at)}, ${pb.label}`}
                />
              )
            })
          )}
        </SettingsSection>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  skeleton: { gap: space.lg },
  scroll: { gap: space.lg, paddingBottom: space.xxl },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.lg },
  planRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  datesRow: { flexDirection: "row", gap: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  emptyPayments: { padding: space.lg },
  payIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
})
