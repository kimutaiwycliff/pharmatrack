import { useEffect, useState } from "react"
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { formatKES } from "@pharmatrack/core"
import { apiFetch } from "../src/lib/api-fetch"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusBadge } from "../src/components"
import type { BadgeStatus } from "../src/components"

// Mirrors apps/web/app/api/reports/route.ts's response shapes exactly
// (verified against that file directly, not from memory — same source
// apps/web/app/(dashboard)/reports/page.tsx types against). Money fields are
// decimal KES (not cents) — same convention as dashboard.tsx/inventory.tsx,
// so money() below does formatKES(Math.round(v * 100)).
//
// `summary.totalSplit` on the sales report is always 0 (dead field in the web
// app itself — split amounts fold into totalCash/totalMpesa) so it's omitted
// here entirely rather than shown as a misleading always-zero KPI.
interface SalesReport {
  summary: {
    totalRevenue: number
    totalCash: number
    totalMpesa: number
    totalDiscount: number
    transactionCount: number
    totalCost: number
    totalProfit: number
  }
  dailyChart: { date: string; revenue: number; cash: number; mpesa: number; count: number }[]
  byCashier: { name: string; revenue: number; count: number }[]
  topProducts: { name: string; qty: number; revenue: number; cost: number; profit: number; margin: number | null }[]
  transactions: {
    id: string
    receipt_number: string
    created_at: string
    payment_method: string
    total_amount: number
    discount_amount: number
    cashier: string
    branch: string
    item_count: number
  }[]
}

interface InventoryReport {
  summary: { totalSKUs: number; outOfStock: number; lowStock: number; expiring: number; controlled: number }
  items: {
    product_id: string
    name: string
    brand_name: string | null
    strength: string | null
    dosage_form: string | null
    stock_on_hand: number | null
    reorder_level: number | null
    base_unit: string | null
    expiry_days: number | null
    is_controlled: boolean | null
    selling_price: number | null
    cost_price: number | null
    status: "out_of_stock" | "low_stock" | "expiring" | "ok"
  }[]
}

interface FinancialReport {
  summary: { totalRevenue: number; totalDiscounts: number; transactions: number; avgOrderValue: number; totalProfit: number }
  monthlyChart: { month: string; revenue: number; discounts: number; count: number; profit: number }[]
}

type ReportType = "sales" | "inventory" | "financial"
type DatePreset = "today" | "7d" | "30d" | "month"

type ReportState =
  | { type: "sales"; payload: SalesReport }
  | { type: "inventory"; payload: InventoryReport }
  | { type: "financial"; payload: FinancialReport }

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
]

// ─── Formatting helpers ──────────────────────────────────────────────────────

function money(v: number): string {
  return formatKES(Math.round(v * 100))
}

// Devices run exclusively in Kenya (single timezone, no DST — see shifts.tsx),
// so the device's local clock reads as Africa/Nairobi time. Using local date
// fields (not toISOString, which is UTC) keeps preset ranges pinned to the
// Nairobi calendar day.
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function dateRangeFor(preset: DatePreset): { from: string; to: string } {
  const now = new Date()
  const to = toDateStr(now)
  const from = new Date(now)
  if (preset === "7d") from.setDate(from.getDate() - 6)
  else if (preset === "30d") from.setDate(from.getDate() - 29)
  else if (preset === "month") from.setDate(1)
  return { from: toDateStr(from), to }
}

// dailyChart's `date` is a bare "YYYY-MM-DD" calendar date already grouped by
// Africa/Nairobi (the API route groups server-side) — parsed as UTC midnight
// and formatted with UTC fields (mirrors dashboard.tsx's formatShortDate)
// keeps it pinned to that day regardless of the device's own offset.
function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
}

function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString([], {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString([], { day: "2-digit", month: "short" })
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return `${date}, ${time}`
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

function statusBadgeFor(status: InventoryReport["items"][number]["status"]): { status: BadgeStatus; label: string } {
  switch (status) {
    case "out_of_stock":
      return { status: "danger", label: "Out of stock" }
    case "low_stock":
      return { status: "warning", label: "Low stock" }
    case "expiring":
      return { status: "warning", label: "Expiring" }
    default:
      return { status: "ok", label: "OK" }
  }
}

// ─── Small shared pieces ─────────────────────────────────────────────────────

function FilterChip({ label, active, onPress, styles }: { label: string; active: boolean; onPress: () => void; styles: Styles }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

function ReportControls({
  styles,
  reportType,
  onSelectReportType,
  branches,
  selectedBranchId,
  onSelectBranch,
  datePreset,
  onSelectDatePreset,
  error,
}: {
  styles: Styles
  reportType: ReportType
  onSelectReportType: (t: ReportType) => void
  branches: { id: string; name: string }[]
  selectedBranchId: string | null
  onSelectBranch: (id: string | null) => void
  datePreset: DatePreset
  onSelectDatePreset: (p: DatePreset) => void
  error: string | null
}) {
  return (
    <View style={styles.controls}>
      <View style={styles.methodRow}>
        <Button
          title="Sales"
          variant={reportType === "sales" ? "primary" : "secondary"}
          onPress={() => onSelectReportType("sales")}
          style={styles.methodButton}
        />
        <Button
          title="Inventory"
          variant={reportType === "inventory" ? "primary" : "secondary"}
          onPress={() => onSelectReportType("inventory")}
          style={styles.methodButton}
        />
        <Button
          title="Financial"
          variant={reportType === "financial" ? "primary" : "secondary"}
          onPress={() => onSelectReportType("financial")}
          style={styles.methodButton}
        />
      </View>

      {branches.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <FilterChip label="All branches" active={selectedBranchId === null} onPress={() => onSelectBranch(null)} styles={styles} />
          {branches.map((b) => (
            <FilterChip
              key={b.id}
              label={b.name}
              active={selectedBranchId === b.id}
              onPress={() => onSelectBranch(b.id)}
              styles={styles}
            />
          ))}
        </ScrollView>
      ) : null}

      {reportType !== "inventory" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {DATE_PRESETS.map((p) => (
            <FilterChip
              key={p.key}
              label={p.label}
              active={datePreset === p.key}
              onPress={() => onSelectDatePreset(p.key)}
              styles={styles}
            />
          ))}
        </ScrollView>
      ) : null}

      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
    </View>
  )
}

// ─── Row renderers (FlatList items) ─────────────────────────────────────────

function TransactionRow({ t, styles }: { t: SalesReport["transactions"][number]; styles: Styles }) {
  return (
    <Card style={styles.listRowCard}>
      <View style={styles.txnRow}>
        <View style={styles.txnLeft}>
          <Text style={styles.txnReceipt}>{t.receipt_number}</Text>
          <Text style={styles.txnMeta}>
            {formatDateTime(t.created_at)} · {paymentLabel(t.payment_method)}
          </Text>
          <Text style={styles.txnMeta}>
            {t.cashier} · {t.branch} · {t.item_count} items
          </Text>
        </View>
        <View style={styles.txnRight}>
          <Text style={styles.txnAmount}>{money(t.total_amount)}</Text>
          {t.discount_amount > 0 ? <Text style={styles.txnDiscount}>-{money(t.discount_amount)}</Text> : null}
        </View>
      </View>
    </Card>
  )
}

function InventoryItemRow({ item, styles }: { item: InventoryReport["items"][number]; styles: Styles }) {
  const badge = statusBadgeFor(item.status)
  const metaParts = [item.brand_name, item.strength, item.dosage_form].filter((v): v is string => !!v)
  const expiryNote =
    item.expiry_days != null && item.expiry_days <= 90
      ? item.expiry_days < 0
        ? " · EXPIRED"
        : ` · expires in ${item.expiry_days}d`
      : ""

  return (
    <Card style={styles.listRowCard}>
      <View style={styles.productHeaderRow}>
        <View style={styles.productNameCol}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.name}
          </Text>
          {metaParts.length > 0 ? (
            <Text style={styles.productMeta} numberOfLines={1}>
              {metaParts.join(" · ")}
            </Text>
          ) : null}
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.priceText}>{item.selling_price != null ? money(item.selling_price) : "—"}</Text>
          {item.cost_price != null ? <Text style={styles.costText}>Cost {money(item.cost_price)}</Text> : null}
        </View>
      </View>
      <View style={styles.productFooterRow}>
        <Text style={styles.stockText} numberOfLines={1}>
          {item.stock_on_hand ?? 0} {item.base_unit ?? "units"} in stock{expiryNote}
        </Text>
        <View style={styles.badgeRow}>
          <StatusBadge status={badge.status} label={badge.label} />
          {item.is_controlled ? <StatusBadge status="neutral" label="Controlled" /> : null}
        </View>
      </View>
    </Card>
  )
}

function MonthlyRow({ m, styles }: { m: FinancialReport["monthlyChart"][number]; styles: Styles }) {
  return (
    <Card style={styles.listRowCard}>
      <View style={styles.monthRow}>
        <Text style={styles.monthLabel}>{formatMonth(m.month)}</Text>
        <Text style={styles.monthMeta}>{m.count} txns</Text>
      </View>
      <View style={styles.monthFigures}>
        <Text style={styles.monthRevenue}>{money(m.revenue)}</Text>
        <Text style={styles.monthSub}>
          Discounts {money(m.discounts)} · Profit {money(m.profit)}
        </Text>
      </View>
    </Card>
  )
}

// ─── Per-type header content (KPIs + trend + secondary lists) ──────────────

function SalesHeaderContent({ payload, theme, styles }: { payload: SalesReport; theme: Theme; styles: Styles }) {
  const { summary, dailyChart, topProducts, byCashier } = payload
  const maxDay = Math.max(1, ...dailyChart.map((d) => d.revenue))

  return (
    <>
      <View style={styles.kpiGrid}>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total revenue</Text>
          <Text style={styles.kpiValue}>{money(summary.totalRevenue)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Gross profit</Text>
          <Text style={styles.kpiValue}>{money(summary.totalProfit)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Cash</Text>
          <Text style={styles.kpiValue}>{money(summary.totalCash)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>M-Pesa</Text>
          <Text style={styles.kpiValue}>{money(summary.totalMpesa)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Discounts given</Text>
          <Text style={styles.kpiValue}>{money(summary.totalDiscount)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Transactions</Text>
          <Text style={styles.kpiValue}>{summary.transactionCount}</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>Daily revenue</Text>
      <Card style={styles.trendCard}>
        {dailyChart.length === 0 ? (
          <Text style={styles.emptyInline}>No sales in this range</Text>
        ) : (
          dailyChart.map((d) => (
            <View key={d.date} style={styles.trendRow}>
              <Text style={styles.trendDate}>{formatShortDate(d.date)}</Text>
              <View style={styles.trendBarTrack}>
                <View
                  style={[
                    styles.trendBarFill,
                    { width: `${Math.round((d.revenue / maxDay) * 100)}%`, backgroundColor: theme.green },
                  ]}
                />
              </View>
              <Text style={styles.trendValue}>{money(d.revenue)}</Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>Top products</Text>
      <Card style={styles.listCard}>
        {topProducts.length === 0 ? (
          <EmptyState icon={<Ionicons name="cube-outline" size={28} color={theme.textTertiary} />} message="No sales in this range" />
        ) : (
          topProducts.map((p, i) => (
            <View key={p.name} style={[styles.metricRow, i > 0 && styles.rowBorder]}>
              <Text style={styles.metricRowName} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.metricRowMeta}>
                {p.qty} sold{p.margin != null ? ` · ${(p.margin * 100).toFixed(0)}% margin` : ""}
              </Text>
              <Text style={styles.metricRowValue}>{money(p.revenue)}</Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>By cashier</Text>
      <Card style={styles.listCard}>
        {byCashier.length === 0 ? (
          <EmptyState icon={<Ionicons name="people-outline" size={28} color={theme.textTertiary} />} message="No sales in this range" />
        ) : (
          byCashier.map((c, i) => (
            <View key={c.name} style={[styles.metricRow, i > 0 && styles.rowBorder]}>
              <Text style={styles.metricRowName} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={styles.metricRowMeta}>{c.count} sales</Text>
              <Text style={styles.metricRowValue}>{money(c.revenue)}</Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>Transactions</Text>
    </>
  )
}

function InventoryHeaderContent({ payload, styles }: { payload: InventoryReport; styles: Styles }) {
  const { summary } = payload
  return (
    <>
      <View style={styles.kpiGrid}>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total SKUs</Text>
          <Text style={styles.kpiValue}>{summary.totalSKUs}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Out of stock</Text>
          <Text style={styles.kpiValue}>{summary.outOfStock}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Low stock</Text>
          <Text style={styles.kpiValue}>{summary.lowStock}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Expiring ≤90d</Text>
          <Text style={styles.kpiValue}>{summary.expiring}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Controlled</Text>
          <Text style={styles.kpiValue}>{summary.controlled}</Text>
        </Card>
      </View>
      <Text style={styles.sectionTitle}>Items</Text>
    </>
  )
}

function FinancialHeaderContent({ payload, theme, styles }: { payload: FinancialReport; theme: Theme; styles: Styles }) {
  const { summary, monthlyChart } = payload
  const maxMonth = Math.max(1, ...monthlyChart.map((m) => m.revenue))

  return (
    <>
      <View style={styles.kpiGrid}>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total revenue</Text>
          <Text style={styles.kpiValue}>{money(summary.totalRevenue)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Gross profit</Text>
          <Text style={styles.kpiValue}>{money(summary.totalProfit)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Avg order value</Text>
          <Text style={styles.kpiValue}>{money(summary.avgOrderValue)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Discounts</Text>
          <Text style={styles.kpiValue}>{money(summary.totalDiscounts)}</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Net revenue</Text>
          <Text style={styles.kpiValue}>{money(summary.totalRevenue - summary.totalDiscounts)}</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>Monthly trend</Text>
      <Card style={styles.trendCard}>
        {monthlyChart.length === 0 ? (
          <Text style={styles.emptyInline}>No financial data in this range</Text>
        ) : (
          monthlyChart.map((m) => (
            <View key={m.month} style={styles.trendRow}>
              <Text style={styles.trendDate}>{formatMonth(m.month)}</Text>
              <View style={styles.trendBarTrack}>
                <View
                  style={[
                    styles.trendBarFill,
                    { width: `${Math.round((m.revenue / maxMonth) * 100)}%`, backgroundColor: theme.green },
                  ]}
                />
              </View>
              <Text style={styles.trendValue}>{money(m.revenue)}</Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>Monthly breakdown</Text>
    </>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function Reports() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { role, branches } = useSessionStore()

  const [reportType, setReportType] = useState<ReportType>("sales")
  const [datePreset, setDatePreset] = useState<DatePreset>("30d")
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

  const [data, setData] = useState<ReportState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [featureLocked, setFeatureLocked] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Bumped by retry/pull-to-refresh to re-run the effect below without
  // exposing the fetch function itself as a captured effect dependency
  // (mirrors dashboard.tsx's shape, required by this repo's
  // react-hooks/set-state-in-effect rule).
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    async function load() {
      if (role && !["owner", "manager"].includes(role)) return
      try {
        const params = new URLSearchParams({ report: reportType })
        if (reportType !== "inventory") {
          const { from, to } = dateRangeFor(datePreset)
          params.set("from", from)
          params.set("to", to)
        }
        if (selectedBranchId) params.set("branch_id", selectedBranchId)

        const res = await apiFetch(`/api/reports?${params.toString()}`)

        if (res.status === 403) {
          const body = await res.json().catch(() => null)
          if (body?.code === "feature_locked") {
            setFeatureLocked(true)
            setError(null)
            setLoaded(true)
            return
          }
          setError("You don't have permission to view reports.")
          setLoaded(true)
          return
        }
        if (!res.ok) {
          setError(`Could not load report (HTTP ${res.status})`)
          return
        }

        setFeatureLocked(false)
        setError(null)
        if (reportType === "sales") {
          setData({ type: "sales", payload: (await res.json()) as SalesReport })
        } else if (reportType === "inventory") {
          setData({ type: "inventory", payload: (await res.json()) as InventoryReport })
        } else {
          setData({ type: "financial", payload: (await res.json()) as FinancialReport })
        }
        setLoaded(true)
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setRefreshing(false)
      }
    }
    load()
  }, [role, reportType, datePreset, selectedBranchId, reloadToken])

  function retry() {
    setReloadToken((t) => t + 1)
  }

  function onRefresh() {
    setRefreshing(true)
    setReloadToken((t) => t + 1)
  }

  if (role && !["owner", "manager"].includes(role)) {
    return (
      <Screen>
        <ScreenHeader title="Reports" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="Only owners and managers can view reports."
        />
      </Screen>
    )
  }

  if (error && !loaded) {
    return (
      <Screen>
        <ScreenHeader title="Reports" />
        <View style={styles.centered}>
          <Card style={styles.errorCard}>
            <Text style={styles.error}>{error}</Text>
            <Button
              title="Retry"
              variant="secondary"
              onPress={retry}
              icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
            />
          </Card>
        </View>
      </Screen>
    )
  }

  if (!loaded) {
    return (
      <Screen>
        <ScreenHeader title="Reports" />
        <View style={styles.centered}>
          <Text style={styles.label}>Loading…</Text>
        </View>
      </Screen>
    )
  }

  if (featureLocked) {
    return (
      <Screen>
        <ScreenHeader title="Reports" />
        <View style={styles.centered}>
          <Card style={styles.errorCard}>
            <Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />
            <Text style={styles.lockedTitle}>Reports aren&apos;t included in your current plan</Text>
            <Text style={styles.lockedMessage}>
              Ask your account owner to upgrade the subscription to unlock sales, inventory, and financial reports.
            </Text>
            <Button
              title="Check again"
              variant="secondary"
              onPress={retry}
              icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
            />
          </Card>
        </View>
      </Screen>
    )
  }

  const salesPayload = data?.type === "sales" ? data.payload : null
  const inventoryPayload = data?.type === "inventory" ? data.payload : null
  const financialPayload = data?.type === "financial" ? data.payload : null

  const controls = (
    <ReportControls
      styles={styles}
      reportType={reportType}
      onSelectReportType={setReportType}
      branches={branches}
      selectedBranchId={selectedBranchId}
      onSelectBranch={setSelectedBranchId}
      datePreset={datePreset}
      onSelectDatePreset={setDatePreset}
      error={error}
    />
  )

  if (reportType === "sales") {
    return (
      <Screen>
        <ScreenHeader title="Reports" />
        <FlatList
          data={salesPayload?.transactions ?? []}
          keyExtractor={(t) => t.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerGap}>
              {controls}
              {salesPayload ? (
                <SalesHeaderContent payload={salesPayload} theme={theme} styles={styles} />
              ) : (
                <Text style={styles.emptyInline}>Loading report…</Text>
              )}
            </View>
          }
          renderItem={({ item }) => <TransactionRow t={item} styles={styles} />}
          ItemSeparatorComponent={() => <View style={styles.rowGap} />}
          ListEmptyComponent={
            salesPayload ? (
              <EmptyState
                icon={<Ionicons name="receipt-outline" size={28} color={theme.textTertiary} />}
                message="No transactions in this range"
              />
            ) : null
          }
        />
      </Screen>
    )
  }

  if (reportType === "inventory") {
    return (
      <Screen>
        <ScreenHeader title="Reports" />
        <FlatList
          data={inventoryPayload?.items ?? []}
          keyExtractor={(item) => item.product_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerGap}>
              {controls}
              {inventoryPayload ? (
                <InventoryHeaderContent payload={inventoryPayload} styles={styles} />
              ) : (
                <Text style={styles.emptyInline}>Loading report…</Text>
              )}
            </View>
          }
          renderItem={({ item }) => <InventoryItemRow item={item} styles={styles} />}
          ItemSeparatorComponent={() => <View style={styles.rowGap} />}
          ListEmptyComponent={
            inventoryPayload ? (
              <EmptyState icon={<Ionicons name="cube-outline" size={28} color={theme.textTertiary} />} message="No products found" />
            ) : null
          }
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Reports" />
      <FlatList
        data={financialPayload ? [...financialPayload.monthlyChart].reverse() : []}
        keyExtractor={(m) => m.month}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerGap}>
            {controls}
            {financialPayload ? (
              <FinancialHeaderContent payload={financialPayload} theme={theme} styles={styles} />
            ) : (
              <Text style={styles.emptyInline}>Loading report…</Text>
            )}
          </View>
        }
        renderItem={({ item }) => <MonthlyRow m={item} styles={styles} />}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          financialPayload ? (
            <EmptyState icon={<Ionicons name="bar-chart-outline" size={28} color={theme.textTertiary} />} message="No financial data in this range" />
          ) : null
        }
      />
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    label: { fontSize: 15, color: theme.text },
    error: { color: theme.red },
    errorCard: { gap: 8, alignItems: "center" },
    lockedTitle: { fontSize: 16, fontWeight: "700", color: theme.text, textAlign: "center" },
    lockedMessage: { fontSize: 13, color: theme.textSecondary, textAlign: "center" },

    listContent: { paddingBottom: 24 },
    headerGap: { gap: 12, marginBottom: 4 },

    controls: { gap: 10 },
    methodRow: { flexDirection: "row", gap: 8 },
    methodButton: { flex: 1, paddingVertical: 10, paddingHorizontal: 8 },
    filterRow: { gap: 8, paddingVertical: 2 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.muted,
    },
    chipActive: { backgroundColor: theme.greenCta, borderColor: theme.greenCta },
    chipText: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },
    chipTextActive: { color: "#fff" },
    inlineError: { color: theme.red, fontSize: 13 },
    emptyInline: { fontSize: 13, color: theme.textSecondary, paddingVertical: 8 },

    sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 4 },

    kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    kpiCard: { flexBasis: "47%", flexGrow: 1, gap: 4 },
    kpiLabel: { fontSize: 12, color: theme.textSecondary },
    kpiValue: { fontSize: 18, fontWeight: "700", color: theme.text },

    trendCard: { gap: 8 },
    trendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    trendDate: { width: 72, fontSize: 12, color: theme.textSecondary },
    trendBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.muted, overflow: "hidden" },
    trendBarFill: { height: 8, borderRadius: 4 },
    trendValue: { width: 92, textAlign: "right", fontSize: 12, color: theme.text },

    listCard: { paddingVertical: 4 },
    rowBorder: { borderTopWidth: 1, borderTopColor: theme.border },
    metricRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
    metricRowName: { flex: 1, color: theme.text },
    metricRowMeta: { fontSize: 12, color: theme.textSecondary },
    metricRowValue: { fontWeight: "600", color: theme.text },

    listRowCard: { gap: 8 },
    rowGap: { height: 8 },

    txnRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    txnLeft: { gap: 2, flex: 1 },
    txnReceipt: { fontWeight: "600", color: theme.text },
    txnMeta: { fontSize: 12, color: theme.textSecondary },
    txnRight: { alignItems: "flex-end", gap: 2 },
    txnAmount: { fontWeight: "700", color: theme.text },
    txnDiscount: { fontSize: 12, color: theme.amber },

    productHeaderRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    productNameCol: { flex: 1, gap: 2 },
    productName: { fontSize: 15, fontWeight: "600", color: theme.text },
    productMeta: { fontSize: 12, color: theme.textSecondary },
    priceCol: { alignItems: "flex-end", gap: 2 },
    priceText: { fontSize: 15, fontWeight: "700", color: theme.text },
    costText: { fontSize: 12, color: theme.textTertiary },
    productFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4 },
    stockText: { fontSize: 13, color: theme.textSecondary, flex: 1 },
    badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" },

    monthRow: { flexDirection: "row", justifyContent: "space-between" },
    monthLabel: { fontWeight: "700", color: theme.text },
    monthMeta: { fontSize: 12, color: theme.textSecondary },
    monthFigures: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    monthRevenue: { fontWeight: "700", color: theme.text },
    monthSub: { fontSize: 12, color: theme.textSecondary },
  })
}

type Styles = ReturnType<typeof createStyles>
