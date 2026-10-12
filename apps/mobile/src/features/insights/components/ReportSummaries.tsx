import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { ScrollView, StyleSheet, View } from "react-native"
import { Chip, EmptyState, ListRow, Money, Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { cashiersCsv, inventoryCsv, monthlyCsv, topProductsCsv, transactionsCsv } from "../logic/csv"
import { INVENTORY_FILTERS, marginLabel, toCents, type InventoryFilter } from "../logic/kpis"
import { monthLabel, shortDayLabel } from "../logic/labels"
import type { DayRange } from "../logic/ranges"
import { shareCsv } from "../shareCsv"
import type { FinancialReport, InventoryReport, InventoryReportItem, SalesReport } from "../types"
import { BarChart } from "./BarChart"
import { KpiGrid, type Kpi } from "./KpiGrid"
import { Section } from "./Section"

// The part of each report above its main table (KPIs, charts, small tables),
// rendered as the FlashList header on app/reports.tsx. Wording follows
// apps/web/app/(dashboard)/reports/page.tsx. Cost / profit figures only show
// for people with cost.view.

const kes = (v: number) => formatKES(toCents(v))

export function SalesSummary({ report, range, canCost }: { report: SalesReport; range: DayRange; canCost: boolean }) {
  const theme = useTheme()
  const { summary, dailyChart, topProducts, byCashier, transactions } = report
  const kpis: Kpi[] = [
    { key: "revenue", label: "Total revenue", value: kes(summary.totalRevenue), sub: `${summary.transactionCount} transaction${summary.transactionCount === 1 ? "" : "s"}` },
    ...(canCost
      ? [{ key: "profit", label: "Gross profit", value: kes(summary.totalProfit), sub: marginLabel(summary.totalProfit, summary.totalRevenue), tone: summary.totalProfit < 0 ? ("danger" as const) : undefined }]
      : []),
    { key: "cash", label: "Cash", value: kes(summary.totalCash) },
    { key: "mpesa", label: "M-Pesa", value: kes(summary.totalMpesa) },
    { key: "discount", label: "Discounts given", value: kes(summary.totalDiscount) },
  ]

  return (
    <View style={styles.stack}>
      <KpiGrid items={kpis} />

      <Section title="Daily revenue">
        {dailyChart.length === 0 ? (
          <Text tone="secondary" variant="caption">
            No sales in this range.
          </Text>
        ) : (
          <BarChart
            data={dailyChart.map((d) => ({
              key: d.date,
              label: shortDayLabel(d.date),
              a11yLabel: `${shortDayLabel(d.date)}, ${d.count} sale${d.count === 1 ? "" : "s"}`,
              value: d.revenue,
              valueLabel: kes(d.revenue),
            }))}
          />
        )}
      </Section>

      <Section
        title="Top products by revenue"
        flush
        onShareCsv={topProducts.length ? () => shareCsv(topProductsCsv(topProducts, range, canCost)) : undefined}
      >
        {topProducts.length === 0 ? (
          <EmptyState icon={<Ionicons name="cube-outline" size={28} color={theme.textTertiary} />} message="No products sold in this range." />
        ) : (
          topProducts.map((p, i) => {
            const margin = canCost && p.margin != null ? `${(p.margin * 100).toFixed(0)}% margin` : null
            return (
              <ListRow
                key={`${p.name}-${i}`}
                title={p.name}
                subtitle={[`${p.qty} sold`, margin].filter(Boolean).join(" · ")}
                meta={
                  canCost ? (
                    <Text variant="caption" tone={p.profit < 0 ? "danger" : "success"} tabular>
                      {kes(p.profit)} profit
                    </Text>
                  ) : null
                }
                trailing={<Money cents={toCents(p.revenue)} />}
                accessibilityLabel={`${p.name}, ${p.qty} sold, ${kes(p.revenue)}${canCost ? `, ${kes(p.profit)} profit` : ""}`}
                style={i === topProducts.length - 1 ? styles.lastRow : null}
              />
            )
          })
        )}
      </Section>

      <Section
        title="Sales by cashier"
        flush
        onShareCsv={byCashier.length ? () => shareCsv(cashiersCsv(byCashier, range)) : undefined}
      >
        {byCashier.length === 0 ? (
          <EmptyState icon={<Ionicons name="people-outline" size={28} color={theme.textTertiary} />} message="No sales in this range." />
        ) : (
          byCashier.map((c, i) => (
            <ListRow
              key={`${c.name}-${i}`}
              title={c.name}
              subtitle={`${c.count} sale${c.count === 1 ? "" : "s"}`}
              trailing={<Money cents={toCents(c.revenue)} />}
              accessibilityLabel={`${c.name}, ${c.count} sales, ${kes(c.revenue)}`}
              style={i === byCashier.length - 1 ? styles.lastRow : null}
            />
          ))
        )}
      </Section>

      <Section
        title="Transactions"
        subtitle="Latest 100 in this range"
        onShareCsv={transactions.length ? () => shareCsv(transactionsCsv(transactions, range)) : undefined}
      />
    </View>
  )
}

export function InventorySummary({
  report, filter, onFilter, filtered, canCost,
}: { report: InventoryReport; filter: InventoryFilter; onFilter: (f: InventoryFilter) => void; filtered: InventoryReportItem[]; canCost: boolean }) {
  const { summary } = report
  const counts: Record<InventoryFilter, number> = {
    all: summary.totalSKUs,
    out_of_stock: summary.outOfStock,
    low_stock: summary.lowStock,
    expiring: summary.expiring,
    controlled: summary.controlled,
  }
  const kpis: Kpi[] = [
    { key: "skus", label: "Total SKUs", value: String(summary.totalSKUs) },
    { key: "out", label: "Out of stock", value: String(summary.outOfStock), tone: summary.outOfStock > 0 ? "danger" : undefined },
    { key: "low", label: "Low stock", value: String(summary.lowStock), tone: summary.lowStock > 0 ? "warning" : undefined },
    { key: "exp", label: "Expiring ≤90d", value: String(summary.expiring), tone: summary.expiring > 0 ? "warning" : undefined },
    { key: "ctl", label: "Controlled", value: String(summary.controlled) },
  ]
  return (
    <View style={styles.stack}>
      <KpiGrid items={kpis} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {INVENTORY_FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={`${f.label} (${counts[f.key]})`}
            selected={filter === f.key}
            onPress={() => onFilter(f.key)}
            accessibilityLabel={`Show ${f.label.toLowerCase()}, ${counts[f.key]} products`}
          />
        ))}
      </ScrollView>
      <Section
        title="Items"
        subtitle={`${filtered.length} product${filtered.length === 1 ? "" : "s"}`}
        onShareCsv={filtered.length ? () => shareCsv(inventoryCsv(filtered, canCost)) : undefined}
      />
    </View>
  )
}

export function FinancialSummary({ report, range, canCost }: { report: FinancialReport; range: DayRange; canCost: boolean }) {
  const { summary, monthlyChart } = report
  const kpis: Kpi[] = [
    { key: "revenue", label: "Total revenue", value: kes(summary.totalRevenue), sub: `${summary.transactions} transaction${summary.transactions === 1 ? "" : "s"}` },
    ...(canCost
      ? [{ key: "profit", label: "Gross profit", value: kes(summary.totalProfit), sub: marginLabel(summary.totalProfit, summary.totalRevenue), tone: summary.totalProfit < 0 ? ("danger" as const) : undefined }]
      : []),
    { key: "aov", label: "Avg. order value", value: kes(summary.avgOrderValue) },
    { key: "disc", label: "Total discounts", value: kes(summary.totalDiscounts) },
    { key: "net", label: "Net revenue", value: formatKES(toCents(summary.totalRevenue) - toCents(summary.totalDiscounts)) },
  ]
  return (
    <View style={styles.stack}>
      <KpiGrid items={kpis} />
      <Section title="Monthly revenue trend">
        {monthlyChart.length === 0 ? (
          <Text tone="secondary" variant="caption">
            No sales in this range.
          </Text>
        ) : (
          <BarChart
            layout="rows"
            data={monthlyChart.map((m) => ({
              key: m.month,
              label: monthLabel(m.month),
              a11yLabel: `${monthLabel(m.month)}, ${m.count} transactions`,
              value: m.revenue,
              valueLabel: kes(m.revenue),
            }))}
          />
        )}
      </Section>
      <Section
        title="Monthly breakdown"
        subtitle="Newest month first"
        onShareCsv={monthlyChart.length ? () => shareCsv(monthlyCsv(monthlyChart, range, canCost)) : undefined}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.lg },
  chips: { gap: space.sm, paddingVertical: space.xxs },
  lastRow: { borderBottomWidth: 0 },
})
