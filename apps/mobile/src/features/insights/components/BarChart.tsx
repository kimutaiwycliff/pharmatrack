import { StyleSheet, View } from "react-native"
import { Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { barPercents } from "../logic/bars"

export interface BarDatum {
  key: string
  /** Axis label ("Mon", "12 Mar", "Mar 2026"). */
  label: string
  /** Fuller label for TalkBack ("Monday 12 March"); falls back to `label`. */
  a11yLabel?: string
  value: number
  /** Formatted value ("KES 1,200"). */
  valueLabel: string
}

interface BarChartProps {
  data: BarDatum[]
  /** Column chart height (columns layout only). */
  height?: number
  /** Bar drawn in the stronger green (e.g. today). */
  highlightKey?: string
  /** "columns" for a handful of points; "rows" scales to any number. Defaults by length. */
  layout?: "columns" | "rows"
}

const MAX_COLUMNS = 8

// Plain-View bar chart (no chart library — Recharts is web-only). The tallest
// bar fills the track (logic/bars.ts); every bar is its own accessible element
// announcing its label and value, since a picture of bars says nothing to
// TalkBack. Long series switch to horizontal rows so labels stay readable.
export function BarChart({ data, height = 140, highlightKey, layout }: BarChartProps) {
  const theme = useTheme()
  const pcts = barPercents(data.map((d) => d.value))
  const mode = layout ?? (data.length <= MAX_COLUMNS ? "columns" : "rows")

  if (mode === "rows") {
    return (
      <View style={styles.rows}>
        {data.map((d, i) => (
          <View key={d.key} style={styles.row} accessible accessibilityLabel={`${d.a11yLabel ?? d.label}: ${d.valueLabel}`}>
            <Text variant="caption" tone="secondary" style={styles.rowLabel} numberOfLines={1}>
              {d.label}
            </Text>
            <View style={[styles.rowTrack, { backgroundColor: theme.mutedStrong }]}>
              <View
                style={[
                  styles.rowFill,
                  { width: `${pcts[i]}%`, backgroundColor: d.key === highlightKey ? theme.greenCta : theme.green },
                ]}
              />
            </View>
            <Text variant="caption" tabular style={styles.rowValue} numberOfLines={1}>
              {d.valueLabel}
            </Text>
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.columns}>
      {data.map((d, i) => (
        <View key={d.key} style={styles.column} accessible accessibilityLabel={`${d.a11yLabel ?? d.label}: ${d.valueLabel}`}>
          <View style={[styles.colTrack, { height }]}>
            <View
              style={[
                styles.colFill,
                {
                  height: `${pcts[i]}%`,
                  backgroundColor: d.key === highlightKey ? theme.greenCta : theme.green,
                },
              ]}
            />
          </View>
          <Text variant="caption" tone={d.key === highlightKey ? "default" : "secondary"} numberOfLines={1}>
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  columns: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  column: { flex: 1, alignItems: "center", gap: space.xs },
  colTrack: { width: "100%", justifyContent: "flex-end", alignItems: "center" },
  colFill: { width: "70%", maxWidth: 40, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },

  rows: { gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 24 },
  rowLabel: { width: 72 },
  rowTrack: { flex: 1, height: 10, borderRadius: radius.sm, overflow: "hidden" },
  rowFill: { height: 10, borderRadius: radius.sm },
  rowValue: { width: 96, textAlign: "right" },
})
