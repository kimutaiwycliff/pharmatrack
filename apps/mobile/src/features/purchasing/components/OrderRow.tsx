import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { ListRow, Money } from "../../../components"
import { formatDay } from "../../../lib/dates"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { PO_STATUS_LABEL } from "../logic/status"
import { kesToCents, type PurchaseOrderSummary } from "../logic/types"
import { PoStatusBadge } from "./PoStatusBadge"

interface OrderRowProps {
  order: PurchaseOrderSummary
  /** Show the branch name (viewing all branches). */
  showBranch: boolean
  selected?: boolean
  onPress: () => void
}

// One purchase order in the list — supplier, PO number, item count, dates,
// status, and the total only when the API sent it (cost.view).
export function OrderRow({ order: o, showBranch, selected, onPress }: OrderRowProps) {
  const theme = useTheme()
  const totalCents = kesToCents(o.total)
  const subtitle = [
    o.po_number,
    `${o.item_count} item${o.item_count === 1 ? "" : "s"}`,
    showBranch && o.branch_name ? o.branch_name : null,
    `created ${formatDay(o.created_at)}`,
    o.expected_date && o.status !== "received" ? `due ${formatDay(o.expected_date)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const supplier = o.supplier_name ?? "No supplier"
  return (
    <ListRow
      title={supplier}
      subtitle={subtitle}
      onPress={onPress}
      accessibilityLabel={`${supplier}, ${PO_STATUS_LABEL[o.status]}. ${subtitle}${selected ? ", selected" : ""}`}
      style={selected ? { backgroundColor: theme.green50 } : undefined}
      leading={
        <View style={[styles.icon, { backgroundColor: theme.mutedStrong }]}>
          <Ionicons name="cube-outline" size={20} color={theme.textSecondary} />
        </View>
      }
      meta={<PoStatusBadge status={o.status} />}
      trailing={
        <View style={styles.trailing}>
          {totalCents != null ? <Money cents={totalCents} variant="label" /> : null}
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  trailing: { flexDirection: "row", alignItems: "center", gap: space.xs },
})
