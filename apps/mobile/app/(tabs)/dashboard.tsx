import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { router } from "expo-router"
import { useState, type ReactNode } from "react"
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import {
  BranchSwitcher, EmptyState, ErrorState, ListRow, Money, NeedsInternet, Screen, ScreenHeader, SkeletonBlock, SkeletonCards, Text, useIsOnline,
} from "../../src/components"
import { ClientsToCallCard } from "../../src/features/call-list/components/ClientsToCallCard"
import { BarChart } from "../../src/features/insights/components/BarChart"
import { KpiGrid, type Kpi } from "../../src/features/insights/components/KpiGrid"
import { PaymentSplitBar } from "../../src/features/insights/components/PaymentSplitBar"
import { Section } from "../../src/features/insights/components/Section"
import { StockAlerts } from "../../src/features/insights/components/StockAlerts"
import { fillDailySeries, paymentLabel, paymentSplit, percentLabel, toCents } from "../../src/features/insights/logic/kpis"
import { shortDayLabel, weekdayLabel } from "../../src/features/insights/logic/labels"
import { lastNDays } from "../../src/features/insights/logic/ranges"
import type { DashboardResponse } from "../../src/features/insights/types"
import { useCan } from "../../src/hooks/useCan"
import { useQuery } from "../../src/hooks/useQuery"
import { apiJson, withQuery } from "../../src/lib/api"
import { dayLabel, formatDay, formatTime, nairobiDayOf, nairobiToday } from "../../src/lib/dates"
import { env } from "../../src/lib/env"
import { getLocalDashboard } from "../../src/repo/reports"
import { useBranchScope } from "../../src/store/branchScope"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// R3 Dashboard (tab root). Mirrors apps/web/app/(dashboard)/dashboard/page.tsx
// over GET /api/dashboard (apps/web/app/api/dashboard/route.ts): today's KPIs,
// payment split, stock alerts, 7-day revenue, top products (30 days) and
// recent sales. Online it follows the shared branch scope (no branch_id = all
// branches); the Offline Edition reads the same shape from src/repo/reports.ts
// for the session branch. Gross profit isn't shown: this endpoint doesn't
// return it (Reports does).

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE
const LOCAL_PREFIX = "local-dashboard:"

async function loadDashboard(key: string): Promise<DashboardResponse> {
  if (key.startsWith(LOCAL_PREFIX)) {
    const local = await getLocalDashboard(key.slice(LOCAL_PREFIX.length))
    // The local repo reports the M-Pesa share as a 0–1 fraction of sales;
    // the API (and this screen) use a 0–100 percentage.
    return { ...local, kpis: { ...local.kpis, mpesaRate: local.kpis.mpesaRate * 100 } }
  }
  return apiJson<DashboardResponse>(key)
}

export default function Dashboard() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const scope = useBranchScope()
  const sessionBranchId = useSessionStore((s) => s.branchId)
  const allowed = can("dashboard.view")

  const key = !allowed
    ? null
    : OFFLINE
      ? sessionBranchId
        ? `${LOCAL_PREFIX}${sessionBranchId}`
        : null
      : withQuery("/api/dashboard", { branch_id: scope.branchId })
  const q = useQuery<DashboardResponse>(key, loadDashboard)
  // Pull-to-refresh also reloads the Clients to call card (its own query).
  const [refreshSignal, setRefreshSignal] = useState(0)
  const onRefresh = () => {
    q.refresh()
    setRefreshSignal((n) => n + 1)
  }

  const header = (
    <ScreenHeader
      title="Dashboard"
      hideBack
      subtitle={`${OFFLINE ? "This branch" : scope.label} · ${formatDay(nairobiToday())}`}
      right={OFFLINE ? null : <BranchSwitcher />}
    />
  )

  if (!allowed) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          title="No access"
          message="Ask the owner or a manager to give you the “View dashboard” permission."
        />
      </Screen>
    )
  }

  if (!OFFLINE && !online && !q.data) {
    return (
      <Screen>
        {header}
        <NeedsInternet feature="The dashboard" onRetry={q.retry} />
      </Screen>
    )
  }

  if (q.loading) {
    return (
      <Screen>
        {header}
        <View style={styles.content}>
          <SkeletonCards count={4} />
          <SkeletonBlock height={72} />
          <SkeletonBlock height={180} />
        </View>
      </Screen>
    )
  }

  if (!q.data) {
    return (
      <Screen>
        {header}
        <ErrorState message={q.error ?? "Something went wrong."} onRetry={q.retry} title="Couldn't load the dashboard" />
      </Screen>
    )
  }

  return (
    <Screen>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={onRefresh} tintColor={theme.green} colors={[theme.green]} />}
      >
        {q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
        <DashboardBody
          data={q.data}
          canOpenInventory={can("products.view")}
          canSell={can("pos.sell")}
          callList={OFFLINE ? null : <ClientsToCallCard branchId={scope.branchId} refreshSignal={refreshSignal} />}
        />
      </ScrollView>
    </Screen>
  )
}

function DashboardBody({
  data, canOpenInventory, canSell, callList,
}: { data: DashboardResponse; canOpenInventory: boolean; canSell: boolean; callList: ReactNode }) {
  const theme = useTheme()
  const { kpis, alerts, topProducts, recentTransactions } = data
  const today = nairobiToday()
  const week = fillDailySeries(data.chartData, lastNDays(7), (date) => ({ date, total: 0, cash: 0, mpesa: 0, transactions: 0 }))
  const weekTotalCents = week.reduce((sum, d) => sum + toCents(d.total), 0)

  const kpiItems: Kpi[] = [
    { key: "revenue", label: "Today's revenue", value: formatKES(toCents(kpis.todayRevenue)) },
    { key: "count", label: "Transactions", value: String(kpis.todayTransactions) },
    { key: "avg", label: "Average sale", value: formatKES(toCents(kpis.todayAvgBasket)) },
    { key: "mpesa", label: "Paid by M-Pesa", value: percentLabel(kpis.mpesaRate), sub: "of today's revenue" },
  ]

  return (
    <>
      <KpiGrid items={kpiItems} />

      <Section title="Today's payments">
        <PaymentSplitBar split={paymentSplit(week.find((d) => d.date === today))} />
      </Section>

      <Section title="Stock alerts" card={false}>
        <StockAlerts alerts={alerts} canOpenInventory={canOpenInventory} />
      </Section>

      {/* Appointment reminders without SMS: who to phone today (online only). */}
      {callList}

      <Section title="Last 7 days" subtitle={`${formatKES(weekTotalCents)} in total`}>
        <BarChart
          highlightKey={today}
          data={week.map((d) => ({
            key: d.date,
            label: weekdayLabel(d.date),
            a11yLabel: `${dayLabel(d.date)}, ${shortDayLabel(d.date)}, ${d.transactions} sale${d.transactions === 1 ? "" : "s"}`,
            value: d.total,
            valueLabel: formatKES(toCents(d.total)),
          }))}
        />
      </Section>

      <Section title={OFFLINE ? "Top products today" : "Top products (30 days)"} flush>
        {topProducts.length === 0 ? (
          <EmptyState icon={<Ionicons name="cube-outline" size={28} color={theme.textTertiary} />} message="No sales in this period yet." />
        ) : (
          topProducts.map((p, i) => (
            <ListRow
              key={p.product_id}
              title={p.name}
              subtitle={`${p.qty} sold`}
              accessibilityLabel={`${i + 1}. ${p.name}, ${p.qty} sold, ${formatKES(toCents(p.revenue))}`}
              leading={
                <Text variant="label" tone="tertiary" tabular style={styles.rank}>
                  {i + 1}
                </Text>
              }
              trailing={<Money cents={toCents(p.revenue)} />}
              style={i === topProducts.length - 1 ? styles.lastRow : null}
            />
          ))
        )}
      </Section>

      <Section title="Recent sales" flush>
        {recentTransactions.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="receipt-outline" size={28} color={theme.textTertiary} />}
            message="No sales in the last 7 days."
            action={canSell ? { label: "Open the till", onPress: () => router.navigate("/pos") } : undefined}
          />
        ) : (
          recentTransactions.map((t, i) => {
            const when = `${dayLabel(nairobiDayOf(t.created_at))}, ${formatTime(t.created_at)}`
            return (
              <ListRow
                key={t.id}
                title={t.receipt_number || "Sale"}
                subtitle={`${when} · ${paymentLabel(t.payment_method)}`}
                trailing={
                  <View style={styles.trailing}>
                    <Money cents={toCents(t.total_amount)} />
                    <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                  </View>
                }
                onPress={() => router.push(`/sales/${t.id}`)}
                accessibilityLabel={`Receipt ${t.receipt_number}, ${when}, ${paymentLabel(t.payment_method)}, ${formatKES(toCents(t.total_amount))}`}
                accessibilityHint="Opens the sale"
                style={i === recentTransactions.length - 1 ? styles.lastRow : null}
              />
            )
          })
        )}
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingBottom: space.xl },
  rank: { width: 20, textAlign: "center" },
  trailing: { flexDirection: "row", alignItems: "center", gap: space.xs },
  lastRow: { borderBottomWidth: 0 },
})
