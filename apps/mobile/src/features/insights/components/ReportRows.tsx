import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { router } from "expo-router"
import { StyleSheet, View } from "react-native"
import { ListRow, Money, StatusBadge, Text, type BadgeStatus } from "../../../components"
import { formatDateTime } from "../../../lib/dates"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { expiryNote, inventoryStatusLabel, paymentLabel, toCents } from "../logic/kpis"
import { monthLabel } from "../logic/labels"
import type { FinancialReport, InventoryReportItem, InventoryStatus, SalesReport } from "../types"

// One row of each report's main table (FlashList items on app/reports.tsx).

const kes = (v: number) => formatKES(toCents(v))

export function TransactionRow({ t }: { t: SalesReport["transactions"][number] }) {
  const theme = useTheme()
  const when = formatDateTime(t.created_at)
  const who = [t.cashier, t.branch, `${t.item_count} item${t.item_count === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
  return (
    <ListRow
      title={t.receipt_number || "Sale"}
      subtitle={`${when} · ${paymentLabel(t.payment_method)}`}
      meta={
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {who}
        </Text>
      }
      trailing={
        <View style={styles.trailing}>
          <View style={styles.amounts}>
            <Money cents={toCents(t.total_amount)} />
            {t.discount_amount > 0 ? (
              <Text variant="caption" tone="warning" tabular>
                −{kes(t.discount_amount)}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </View>
      }
      onPress={() => router.push(`/sales/${t.id}`)}
      accessibilityLabel={`Receipt ${t.receipt_number}, ${when}, ${paymentLabel(t.payment_method)}, ${who}, ${kes(t.total_amount)}${t.discount_amount > 0 ? `, discount ${kes(t.discount_amount)}` : ""}`}
      accessibilityHint="Opens the sale"
      style={styles.row}
    />
  )
}

const BADGE: Record<InventoryStatus, BadgeStatus> = { out_of_stock: "danger", low_stock: "warning", expiring: "warning", ok: "ok" }

export function InventoryRow({ item, canCost, canOpen }: { item: InventoryReportItem; canCost: boolean; canOpen: boolean }) {
  const details = [item.brand_name, item.strength, item.dosage_form].filter(Boolean).join(" · ")
  const stock = `${item.stock_on_hand ?? 0} ${item.base_unit ?? "units"} in stock`
  const expiry = expiryNote(item.expiry_days)
  const status = inventoryStatusLabel(item.status)
  return (
    <ListRow
      title={item.name}
      subtitle={details || null}
      meta={
        <View style={styles.meta}>
          <Text variant="caption" tone="secondary" tabular>
            {stock}
          </Text>
          <View style={styles.badges}>
            <StatusBadge status={BADGE[item.status]} label={status} />
            {item.is_controlled ? <StatusBadge status="neutral" label="Controlled" /> : null}
            {expiry ? (
              <Text variant="caption" tone={item.expiry_days != null && item.expiry_days <= 30 ? "danger" : "warning"}>
                {expiry}
              </Text>
            ) : null}
          </View>
        </View>
      }
      trailing={
        <View style={styles.amounts}>
          {item.selling_price != null ? <Money cents={toCents(item.selling_price)} /> : <Text tone="tertiary">—</Text>}
          {canCost && item.cost_price != null ? (
            <Text variant="caption" tone="tertiary" tabular>
              Cost {kes(item.cost_price)}
            </Text>
          ) : null}
        </View>
      }
      onPress={canOpen ? () => router.push({ pathname: "/product-batches", params: { productId: item.product_id, productName: item.name } }) : undefined}
      accessibilityLabel={`${item.name}${details ? `, ${details}` : ""}, ${stock}, ${status}${item.is_controlled ? ", controlled" : ""}${expiry ? `, ${expiry}` : ""}`}
      accessibilityHint={canOpen ? "Opens this product's batches" : undefined}
      style={styles.row}
    />
  )
}

export function MonthRow({ m, canCost }: { m: FinancialReport["monthlyChart"][number]; canCost: boolean }) {
  const net = formatKES(toCents(m.revenue) - toCents(m.discounts))
  const label = monthLabel(m.month)
  return (
    <ListRow
      title={label}
      subtitle={`${m.count} transaction${m.count === 1 ? "" : "s"} · Discounts ${kes(m.discounts)}`}
      meta={
        <Text variant="caption" tone="tertiary" tabular>
          {canCost ? `Gross profit ${kes(m.profit)} · ` : ""}Net {net}
        </Text>
      }
      trailing={<Money cents={toCents(m.revenue)} />}
      accessibilityLabel={`${label}, revenue ${kes(m.revenue)}, ${m.count} transactions, discounts ${kes(m.discounts)}${canCost ? `, gross profit ${kes(m.profit)}` : ""}, net ${net}`}
      style={styles.row}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.xs },
  trailing: { flexDirection: "row", alignItems: "center", gap: space.xs },
  amounts: { alignItems: "flex-end", gap: space.xxs },
  meta: { gap: space.xs },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
})
