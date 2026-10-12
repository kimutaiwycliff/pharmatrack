import { formatKES } from "@pharmatrack/core"
import { StyleSheet, View } from "react-native"
import { Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import type { PaymentSplit } from "../logic/kpis"

// Today's takings by payment method as one stacked bar plus a legend — the
// mobile stand-in for the web dashboard's payment split. Split sales count
// under M-Pesa, as the API groups them.
export function PaymentSplitBar({ split }: { split: PaymentSplit }) {
  const theme = useTheme()
  const parts = [
    { key: "cash", label: "Cash", cents: split.cashCents, color: theme.green },
    { key: "mpesa", label: "M-Pesa", cents: split.mpesaCents, color: theme.greenCta },
    { key: "other", label: "Card / other", cents: split.otherCents, color: theme.amber },
  ].filter((p) => p.cents > 0)

  if (split.totalCents <= 0) {
    return (
      <Text tone="secondary" variant="caption">
        No sales yet today.
      </Text>
    )
  }

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.bar, { backgroundColor: theme.mutedStrong }]}
        accessible
        accessibilityLabel={`Today's payments: ${parts.map((p) => `${p.label} ${formatKES(p.cents)}`).join(", ")}`}
      >
        {parts.map((p) => (
          <View key={p.key} style={{ flex: p.cents, backgroundColor: p.color }} />
        ))}
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants">
        {parts.map((p) => (
          <View key={p.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text variant="caption" tone="secondary">
              {p.label}
            </Text>
            <Text variant="caption" tabular>
              {formatKES(p.cents)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  bar: { flexDirection: "row", height: 12, borderRadius: radius.pill, overflow: "hidden" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
})
