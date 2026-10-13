import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { router } from "expo-router"
import { useMemo, useState, type ReactNode } from "react"
import { RefreshControl, StyleSheet, View } from "react-native"
import {
  BranchSwitcher, EmptyState, ErrorState, NeedsInternet, Screen, ScreenHeader, SkeletonCards, SkeletonList, useIsOnline,
} from "../src/components"
import { ReportControls, type RangeChoice } from "../src/features/insights/components/ReportControls"
import { InventoryRow, MonthRow, TransactionRow } from "../src/features/insights/components/ReportRows"
import { FinancialSummary, InventorySummary, SalesSummary } from "../src/features/insights/components/ReportSummaries"
import { filterInventory, type InventoryFilter } from "../src/features/insights/logic/kpis"
import { nairobiBounds, presetRange, validateRange, type DayRange } from "../src/features/insights/logic/ranges"
import type { FinancialReport, InventoryReport, InventoryReportItem, ReportResult, ReportType, SalesReport } from "../src/features/insights/types"
import { useCan } from "../src/hooks/useCan"
import { useQuery } from "../src/hooks/useQuery"
import { ApiError, apiJson, withQuery } from "../src/lib/api"
import { formatDay, parseISODate, toISODate } from "../src/lib/dates"
import { env } from "../src/lib/env"
import { getLocalReport } from "../src/repo/reports"
import { useBranchScope } from "../src/store/branchScope"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"

// R3 Reports. Mirrors apps/web/app/(dashboard)/reports/page.tsx over
// GET /api/reports?report=&from=&to=&branch_id= (apps/web/app/api/reports/
// route.ts): Sales, Inventory and Financial, each with KPIs, View-built bars
// and a CSV share on every table. Ranges are Nairobi calendar days. The
// Offline Edition reads the same shapes from src/repo/reports.ts.

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

interface ReportRequest {
  local: boolean
  type: ReportType
  from?: string
  to?: string
  branchId?: string
}

// The query key is the serialised request, so changing any filter refetches
// and shows a skeleton instead of the previous report's numbers.
async function loadReport(key: string): Promise<ReportResult> {
  const req = JSON.parse(key) as ReportRequest
  const range = req.from && req.to ? { from: req.from, to: req.to } : null
  let json: unknown
  if (req.local) {
    const bounds = range ? nairobiBounds(range) : null
    json = await getLocalReport({ type: req.type, from: bounds?.fromIso, to: bounds?.toIso, branchId: req.branchId ?? null })
  } else {
    try {
      json = await apiJson<unknown>(withQuery("/api/reports", { report: req.type, from: req.from, to: req.to, branch_id: req.branchId }))
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { code?: string } | null) : null
      if (err instanceof ApiError && err.status === 403 && body?.code === "feature_locked") return { kind: "locked" }
      throw err
    }
  }
  if (req.type === "sales") return { kind: "sales", payload: json as SalesReport }
  if (req.type === "inventory") return { kind: "inventory", payload: json as InventoryReport }
  return { kind: "financial", payload: json as FinancialReport }
}

type Row =
  | { t: "txn"; key: string; v: SalesReport["transactions"][number] }
  | { t: "item"; key: string; v: InventoryReportItem }
  | { t: "month"; key: string; v: FinancialReport["monthlyChart"][number] }

export default function Reports() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const scope = useBranchScope()
  const allowed = can("reports.view")
  const canCost = can("cost.view")
  const canOpenProduct = can("products.view")

  const [reportType, setReportType] = useState<ReportType>("sales")
  const [rangeChoice, setRangeChoice] = useState<RangeChoice>("30d")
  const [customFrom, setCustomFrom] = useState<Date | null>(null)
  const [customTo, setCustomTo] = useState<Date | null>(null)
  const [invFilter, setInvFilter] = useState<InventoryFilter>("all")

  const range: DayRange =
    rangeChoice === "custom"
      ? { from: customFrom ? toISODate(customFrom) : "", to: customTo ? toISODate(customTo) : "" }
      : presetRange(rangeChoice)
  const rangeError = reportType === "inventory" ? null : validateRange(range)

  function chooseRange(choice: RangeChoice) {
    if (choice === "custom" && rangeChoice !== "custom") {
      // Start the custom pickers from whatever range was showing.
      setCustomFrom(parseISODate(range.from))
      setCustomTo(parseISODate(range.to))
    }
    setRangeChoice(choice)
  }

  const request: ReportRequest = {
    local: OFFLINE,
    type: reportType,
    ...(reportType === "inventory" ? {} : { from: range.from, to: range.to }),
    branchId: scope.branchId,
  }
  const key = allowed && !rangeError ? JSON.stringify(request) : null
  const q = useQuery<ReportResult>(key, loadReport)
  const data = q.data

  const rows: Row[] = useMemo(() => {
    if (!data) return []
    if (data.kind === "sales") return data.payload.transactions.map((v) => ({ t: "txn", key: v.id, v }))
    // One row per product per branch under "All branches", so product_id alone isn't unique.
    if (data.kind === "inventory") return filterInventory(data.payload.items, invFilter).map((v, i) => ({ t: "item", key: `${v.product_id}-${i}`, v }))
    if (data.kind === "financial") return [...data.payload.monthlyChart].reverse().map((v) => ({ t: "month", key: v.month, v }))
    return []
  }, [data, invFilter])

  const subtitle = reportType === "inventory" || rangeError ? scope.label : `${scope.label} · ${rangeLabel(range)}`
  const header = <ScreenHeader title="Reports" subtitle={subtitle} right={<BranchSwitcher />} />

  if (!allowed) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          title="No access"
          message="Ask the owner or a manager to give you the “View reports” permission."
        />
      </Screen>
    )
  }

  if (!OFFLINE && !online && !data) {
    return (
      <Screen>
        {header}
        <NeedsInternet feature="Reports" onRetry={q.retry} />
      </Screen>
    )
  }

  const controls = (
    <ReportControls
      reportType={reportType}
      onReportType={setReportType}
      range={rangeChoice}
      onRange={chooseRange}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFrom={setCustomFrom}
      onCustomTo={setCustomTo}
      rangeError={rangeError}
    />
  )

  // Nothing under the controls while the custom range is invalid — the
  // DateField shows why.
  let body: ReactNode = null
  if (rangeError) {
    // (intentionally empty)
  } else if (q.loading) {
    body = (
      <View style={styles.stack}>
        <SkeletonCards count={4} />
        <SkeletonList rows={6} />
      </View>
    )
  } else if (!data) {
    body = <ErrorState message={q.error ?? "Something went wrong."} onRetry={q.retry} title="Couldn't load this report" />
  } else if (data.kind === "locked") {
    body = (
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
        title="Reports aren't in your plan"
        message="Upgrade the subscription to unlock sales, inventory and financial reports."
        action={
          can("billing.manage")
            ? { label: "View plans", onPress: () => router.push("/billing") }
            : { label: "Check again", onPress: q.retry }
        }
      />
    )
  } else {
    body = (
      <View style={styles.stack}>
        {q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
        {data.kind === "sales" ? <SalesSummary report={data.payload} range={range} canCost={canCost} /> : null}
        {data.kind === "inventory" ? (
          <InventorySummary
            report={data.payload}
            filter={invFilter}
            onFilter={setInvFilter}
            filtered={rows.flatMap((r) => (r.t === "item" ? [r.v] : []))}
            canCost={canCost}
          />
        ) : null}
        {data.kind === "financial" ? <FinancialSummary report={data.payload} range={range} canCost={canCost} /> : null}
      </View>
    )
  }

  const showEmpty = !!data && data.kind !== "locked" && !q.loading && !rangeError

  return (
    <Screen>
      {header}
      <FlashList keyboardShouldPersistTaps="handled"
        data={rows}
        keyExtractor={(r) => r.key}
        getItemType={(r) => r.t}
        renderItem={({ item }) =>
          item.t === "txn" ? (
            <TransactionRow t={item.v} />
          ) : item.t === "item" ? (
            <InventoryRow item={item.v} canCost={canCost} canOpen={canOpenProduct} />
          ) : (
            <MonthRow m={item.v} canCost={canCost} />
          )
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {controls}
            {body}
          </View>
        }
        ListEmptyComponent={
          showEmpty ? (
            <EmptyState
              icon={<Ionicons name={reportType === "inventory" ? "cube-outline" : "receipt-outline"} size={28} color={theme.textTertiary} />}
              message={
                reportType === "inventory"
                  ? invFilter === "all"
                    ? "No active products yet."
                    : "No products match this filter."
                  : "No sales in this range."
              }
              action={
                reportType === "inventory"
                  ? invFilter !== "all"
                    ? { label: "Show all products", onPress: () => setInvFilter("all") }
                    : undefined
                  : rangeChoice !== "30d"
                    ? { label: "Show the last 30 days", onPress: () => setRangeChoice("30d") }
                    : undefined
              }
            />
          ) : null
        }
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={theme.green} colors={[theme.green]} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}

function rangeLabel(r: DayRange): string {
  return r.from === r.to ? formatDay(r.from) : `${formatDay(r.from)} – ${formatDay(r.to)}`
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.xl },
  header: { gap: space.lg, marginBottom: space.xs },
  stack: { gap: space.lg },
})
