import { formatKES } from "@pharmatrack/core"
import { StyleSheet, View } from "react-native"
import { Money, StatusBadge, Text, type TextTone } from "../../../components"
import { varianceLabel } from "../../../lib/shifts/variance"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { varianceExplanation } from "../logic/shifts"

// R3: label-left / amount-right figure rows for the drawer maths (float, cash
// sales, expected, counted) and the variance summary used by both the Shifts
// tab's "Shift closed" card and the Shift detail screen.

export function FigureRow({ label, cents, tone, strong }: { label: string; cents: number | null; tone?: TextTone; strong?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${cents == null ? "not recorded" : formatKES(cents)}`}>
      <Text tone={strong ? "default" : "secondary"} variant={strong ? "bodyStrong" : "body"} style={styles.label}>
        {label}
      </Text>
      {cents == null ? (
        <Text tone="tertiary">—</Text>
      ) : (
        <Money cents={cents} variant={strong ? "headline" : "bodyStrong"} tone={tone} />
      )}
    </View>
  )
}

export function Divider() {
  const theme = useTheme()
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />
}

/** Variance amount + Balanced/Over/Short badge + "Counted KES X more than expected". */
export function VarianceSummary({ varianceCents }: { varianceCents: number | null }) {
  if (varianceCents == null) {
    return (
      <View style={styles.variance}>
        <StatusBadge status="neutral" label="No count" />
        <Text tone="secondary">{varianceExplanation(null)}</Text>
      </View>
    )
  }
  const v = varianceLabel(varianceCents / 100, true)
  const tone: TextTone = v.status === "ok" ? "success" : v.status === "danger" ? "danger" : "warning"
  return (
    <View style={styles.variance}>
      <View style={styles.row}>
        <Text variant="bodyStrong" style={styles.label}>
          Variance
        </Text>
        <StatusBadge status={v.status} label={v.label} />
        <Text variant="headline" tone={tone} tabular>
          {varianceCents > 0 ? "+" : varianceCents < 0 ? "−" : ""}
          {formatKES(Math.abs(varianceCents))}
        </Text>
      </View>
      <Text tone="secondary">{varianceExplanation(varianceCents)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 32 },
  label: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  variance: { gap: space.xs },
})
