import { formatKES } from "@pharmatrack/core"
import { StyleSheet, View } from "react-native"
import { ListRow, StatusBadge, Text } from "../../../components"
import { space } from "../../../theme/tokens"
import type { ShiftListRow } from "../api"
import { kesToCents, shiftBadge, shiftTimeRange } from "../logic/shifts"

// One shift in Shift history: cashier, Nairobi time range, sales total/count
// (+ branch when looking at all branches), and the Open/Balanced/Over/Short
// badge with the variance amount under it.
export function ShiftRow({ shift, showBranch, onPress }: { shift: ShiftListRow; showBranch: boolean; onPress: () => void }) {
  const badge = shiftBadge(shift)
  const salesText = `${formatKES(kesToCents(shift.total_sales))} · ${shift.sale_count} ${shift.sale_count === 1 ? "sale" : "sales"}`
  const varianceCents = shift.variance == null ? null : kesToCents(shift.variance)
  const range = shiftTimeRange(shift.clocked_in_at, shift.clocked_out_at)
  return (
    <ListRow
      title={shift.profiles.full_name}
      subtitle={range}
      meta={
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {showBranch && shift.branch_name ? `${shift.branch_name} · ${salesText}` : salesText}
        </Text>
      }
      trailing={
        <View style={styles.trailing}>
          <StatusBadge status={badge.status} label={badge.label} />
          {varianceCents != null && varianceCents !== 0 ? (
            <Text variant="caption" tone="secondary" tabular>
              {varianceCents > 0 ? "+" : "−"}
              {formatKES(Math.abs(varianceCents))}
            </Text>
          ) : null}
        </View>
      }
      onPress={onPress}
      accessibilityLabel={`${shift.profiles.full_name}, ${range}, ${salesText}, ${badge.label}`}
      accessibilityHint="Opens the shift details"
    />
  )
}

const styles = StyleSheet.create({
  trailing: { alignItems: "flex-end", gap: space.xxs },
})
