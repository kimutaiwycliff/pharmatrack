import { useEffect, useState } from "react"
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { apiFetch } from "../../src/lib/api-fetch"
import { env } from "../../src/lib/env"
import { getLocalDashboard } from "../../src/repo/reports"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import type { Theme } from "../../src/theme/tokens"
import { Button, Card, EmptyState, Screen, StatusBadge } from "../../src/components"

// Mirrors apps/web/app/api/dashboard/route.ts's response shape exactly
// (verified against that file directly, not from memory). All money fields
// are decimal KES (not cents) — same convention as /api/shifts and
// /api/mobile/me, so formatKES(Math.round(v * 100)) is used throughout.
interface DashboardResponse {
  kpis: {
    todayRevenue: number
    todayTransactions: number
    todayAvgBasket: number
    mpesaRate: number
  }
  chartData: { date: string; total: number; cash: number; mpesa: number; transactions: number }[]
  topProducts: { product_id: string; name: string; revenue: number; qty: number }[]
  recentTransactions: {
    id: string
    receipt_number: string
    total_amount: number
    payment_method: string
    customer_name: string | null
    created_at: string
  }[]
  alerts: { outOfStock: number; lowStock: number; expiring: number }
}

// chartData's `date` is a bare "YYYY-MM-DD" calendar date already grouped by
// Africa/Nairobi (apps/web's route groups server-side). Parsing it as UTC
// midnight and formatting with UTC fields keeps it pinned to that day
// regardless of the device's own timezone offset.
function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
}

// Devices run exclusively in Kenya (single timezone, no DST — see shifts.tsx),
// so the device's local clock reads as Africa/Nairobi time for display here.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function paymentLabel(method: string): string {
  switch (method) {
    case "mpesa":
      return "M-Pesa"
    case "cash":
      return "Cash"
    case "card":
      return "Card"
    case "split":
      return "Split"
    default:
      return method
  }
}

export default function Dashboard() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId } = useSessionStore()

  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Bumped by retry/pull-to-refresh to re-run the effect below without
  // exposing the fetch function itself as a captured effect dependency
  // (mirrors src/lib/sync/useSyncEngine.ts's nested-function-inside-the-effect
  // shape, which keeps setState calls local to the effect body).
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!branchId) return
    async function load() {
      try {
        let json: DashboardResponse
        if (env.EXPO_PUBLIC_OFFLINE_MODE) {
          json = await getLocalDashboard(branchId!)
        } else {
          const res = await apiFetch(`/api/dashboard?branch_id=${branchId}`)
          if (!res.ok) {
            setError(`Could not load dashboard (HTTP ${res.status})`)
            return
          }
          json = (await res.json()) as DashboardResponse
        }
        setData(json)
        setLoaded(true)
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setRefreshing(false)
      }
    }
    load()
  }, [branchId, reloadToken])

  function retry() {
    setReloadToken((t) => t + 1)
  }

  function onRefresh() {
    setRefreshing(true)
    setReloadToken((t) => t + 1)
  }

  if (error && !loaded) {
    return (
      <Screen style={styles.centered}>
        <Card style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            onPress={retry}
            icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          />
        </Card>
      </Screen>
    )
  }

  if (!loaded || !data) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.label}>Loading…</Text>
      </Screen>
    )
  }

  const { kpis, chartData, topProducts, recentTransactions, alerts } = data
  const maxDayTotal = Math.max(1, ...chartData.map((d) => d.total))
  const hasAlerts = alerts.outOfStock > 0 || alerts.lowStock > 0 || alerts.expiring > 0

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
      >
        <Text style={styles.title}>Dashboard</Text>

        <View style={styles.kpiGrid}>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{"Today's revenue"}</Text>
            <Text style={styles.kpiValue}>{formatKES(Math.round(kpis.todayRevenue * 100))}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Transactions</Text>
            <Text style={styles.kpiValue}>{kpis.todayTransactions}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Avg basket</Text>
            <Text style={styles.kpiValue}>{formatKES(Math.round(kpis.todayAvgBasket * 100))}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>M-Pesa share</Text>
            <Text style={styles.kpiValue}>{kpis.mpesaRate.toFixed(0)}%</Text>
          </Card>
        </View>

        {hasAlerts ? (
          <View style={styles.alertsRow}>
            {alerts.outOfStock > 0 ? (
              <StatusBadge status="danger" label={`${alerts.outOfStock} out of stock`} />
            ) : null}
            {alerts.lowStock > 0 ? <StatusBadge status="warning" label={`${alerts.lowStock} low stock`} /> : null}
            {alerts.expiring > 0 ? (
              <StatusBadge status="warning" label={`${alerts.expiring} expiring soon`} />
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Last 7 days</Text>
        <Card style={styles.trendCard}>
          {chartData.map((day) => (
            <View key={day.date} style={styles.trendRow}>
              <Text style={styles.trendDate}>{formatShortDate(day.date)}</Text>
              <View style={styles.trendBarTrack}>
                <View
                  style={[
                    styles.trendBarFill,
                    { width: `${Math.round((day.total / maxDayTotal) * 100)}%`, backgroundColor: theme.green },
                  ]}
                />
              </View>
              <Text style={styles.trendValue}>{formatKES(Math.round(day.total * 100))}</Text>
            </View>
          ))}
        </Card>

        <Text style={styles.sectionTitle}>Top products (30 days)</Text>
        <Card style={styles.listCard}>
          {topProducts.length === 0 ? (
            <EmptyState
              icon={<Ionicons name="cube-outline" size={28} color={theme.textTertiary} />}
              message="No sales in the last 30 days"
            />
          ) : (
            topProducts.map((p, i) => (
              <View key={p.product_id} style={[styles.productRow, i > 0 && styles.rowBorder]}>
                <Text style={styles.productName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.productMeta}>{p.qty} sold</Text>
                <Text style={styles.productRevenue}>{formatKES(Math.round(p.revenue * 100))}</Text>
              </View>
            ))
          )}
        </Card>

        <Text style={styles.sectionTitle}>Recent transactions</Text>
        <Card style={styles.listCard}>
          {recentTransactions.length === 0 ? (
            <EmptyState
              icon={<Ionicons name="receipt-outline" size={28} color={theme.textTertiary} />}
              message="No transactions yet today"
            />
          ) : (
            recentTransactions.map((t, i) => (
              <View key={t.id} style={[styles.txnRow, i > 0 && styles.rowBorder]}>
                <View style={styles.txnLeft}>
                  <Text style={styles.txnReceipt}>{t.receipt_number}</Text>
                  <Text style={styles.txnMeta}>
                    {formatTime(t.created_at)} · {paymentLabel(t.payment_method)}
                  </Text>
                </View>
                <Text style={styles.txnAmount}>{formatKES(Math.round(t.total_amount * 100))}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    scrollContent: { gap: 12, paddingBottom: 24 },
    title: { fontSize: 20, fontWeight: "700", color: theme.text },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 4 },
    label: { fontSize: 15, color: theme.text },
    error: { color: theme.red },
    errorCard: { gap: 8 },

    kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    kpiCard: { flexBasis: "47%", flexGrow: 1, gap: 4 },
    kpiLabel: { fontSize: 12, color: theme.textSecondary },
    kpiValue: { fontSize: 18, fontWeight: "700", color: theme.text },

    alertsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

    trendCard: { gap: 8 },
    trendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    trendDate: { width: 52, fontSize: 12, color: theme.textSecondary },
    trendBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.muted, overflow: "hidden" },
    trendBarFill: { height: 8, borderRadius: 4 },
    trendValue: { width: 92, textAlign: "right", fontSize: 12, color: theme.text },

    listCard: { paddingVertical: 4 },
    rowBorder: { borderTopWidth: 1, borderTopColor: theme.border },

    productRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
    productName: { flex: 1, color: theme.text },
    productMeta: { fontSize: 12, color: theme.textSecondary },
    productRevenue: { fontWeight: "600", color: theme.text },

    txnRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
    txnLeft: { gap: 2 },
    txnReceipt: { fontWeight: "600", color: theme.text },
    txnMeta: { fontSize: 12, color: theme.textSecondary },
    txnAmount: { fontWeight: "600", color: theme.text },
  })
}
