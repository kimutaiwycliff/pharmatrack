import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { ListRow, Money, StatusBadge, Text } from "../../../components"
import { dayLabel, formatTime, nairobiDayOf } from "../../../lib/dates"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import type { LocalSaleRow } from "../logic/outboxSale"
import { kesToCents, paymentLabel, type SaleRow } from "../logic/receiptMapping"

// Sales history rows. "Today 14:05 · Jane · M-Pesa" — the cashier only for
// people who can see everyone's sales (sales.view_all); everyone else only
// ever sees their own, so the name would be noise.

function when(iso: string): string {
  return `${dayLabel(nairobiDayOf(iso))} ${formatTime(iso)}`
}

const itemsLabel = (n: number) => `${n} item${n === 1 ? "" : "s"}`

export function ServerSaleRow({
  sale,
  showCashier,
  selected,
  onPress,
}: {
  sale: SaleRow
  showCashier: boolean
  selected?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const receipt = sale.receipt_number || "No receipt number"
  const parts = [when(sale.created_at), showCashier ? sale.cashier_name : null, paymentLabel(sale.payment_method)].filter(Boolean)
  const cents = kesToCents(sale.total_amount)
  return (
    <ListRow
      title={receipt}
      subtitle={parts.join(" · ")}
      onPress={onPress}
      style={selected ? { backgroundColor: theme.green50 } : undefined}
      accessibilityLabel={`Sale ${receipt}, ${parts.join(", ")}, ${itemsLabel(sale.item_count)}`}
      accessibilityHint="Opens the receipt"
      leading={<Ionicons name="receipt-outline" size={22} color={theme.textSecondary} />}
      trailing={
        <View style={styles.trailing}>
          <Money cents={cents} />
          <Text variant="caption" tone="secondary">
            {itemsLabel(sale.item_count)}
          </Text>
        </View>
      }
    />
  )
}

export function LocalSaleListRow({
  sale,
  cashier,
  selected,
  onPress,
}: {
  sale: LocalSaleRow
  /** Null hides the cashier. */
  cashier: string | null
  selected?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const iso = new Date(sale.soldAtMs).toISOString()
  const parts = [when(iso), cashier, paymentLabel(sale.paymentMethod)].filter(Boolean)
  const rejected = sale.status === "rejected"
  return (
    <ListRow
      title={sale.receiptNumber}
      subtitle={parts.join(" · ")}
      onPress={onPress}
      style={selected ? { backgroundColor: theme.green50 } : undefined}
      accessibilityLabel={`Sale ${sale.receiptNumber}, ${rejected ? "not accepted by the server" : "waiting to sync"}, ${parts.join(", ")}`}
      accessibilityHint="Opens the receipt"
      leading={
        <Ionicons
          name={rejected ? "alert-circle-outline" : "cloud-upload-outline"}
          size={22}
          color={rejected ? theme.red : theme.amber}
        />
      }
      meta={
        <View style={styles.meta}>
          <StatusBadge status={rejected ? "danger" : "warning"} label={rejected ? "Not accepted" : "Waiting to sync"} />
        </View>
      }
      trailing={<Money cents={sale.totalCents} />}
    />
  )
}

const styles = StyleSheet.create({
  trailing: { alignItems: "flex-end" },
  meta: { paddingTop: space.xxs },
})
