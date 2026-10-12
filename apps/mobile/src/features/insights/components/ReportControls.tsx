import { ScrollView, StyleSheet, View } from "react-native"
import { Chip, DateField, Text } from "../../../components"
import { space } from "../../../theme/tokens"
import { RANGE_PRESETS, type RangePreset } from "../logic/ranges"
import type { ReportType } from "../types"

export type RangeChoice = RangePreset | "custom"

const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "inventory", label: "Inventory" },
  { key: "financial", label: "Financial" },
]

interface ReportControlsProps {
  reportType: ReportType
  onReportType: (t: ReportType) => void
  range: RangeChoice
  onRange: (r: RangeChoice) => void
  customFrom: Date | null
  customTo: Date | null
  onCustomFrom: (d: Date) => void
  onCustomTo: (d: Date) => void
  rangeError: string | null
}

// Report type + date range pickers (apps/web/app/(dashboard)/reports/page.tsx
// has the same three tabs and a from/to range). Inventory is a snapshot of
// stock right now, so it has no date range — as on the web.
export function ReportControls(p: ReportControlsProps) {
  const today = new Date()
  return (
    <View style={styles.wrap}>
      <View style={styles.types} accessibilityRole="tablist">
        {REPORT_TYPES.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={p.reportType === t.key}
            onPress={() => p.onReportType(t.key)}
            accessibilityLabel={`${t.label} report`}
            style={styles.typeChip}
          />
        ))}
      </View>

      {p.reportType === "inventory" ? (
        <Text variant="caption" tone="secondary">
          Stock levels right now — the date range doesn&apos;t apply.
        </Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
            {RANGE_PRESETS.map((r) => (
              <Chip key={r.key} label={r.label} selected={p.range === r.key} onPress={() => p.onRange(r.key)} accessibilityLabel={`Date range: ${r.label}`} />
            ))}
            <Chip label="Custom" selected={p.range === "custom"} onPress={() => p.onRange("custom")} accessibilityLabel="Date range: custom dates" />
          </ScrollView>
          {p.range === "custom" ? (
            <View style={styles.dates}>
              <View style={styles.date}>
                <DateField label="From" value={p.customFrom} onChange={p.onCustomFrom} maximumDate={p.customTo ?? today} />
              </View>
              <View style={styles.date}>
                <DateField label="To" value={p.customTo} onChange={p.onCustomTo} minimumDate={p.customFrom ?? undefined} maximumDate={today} error={p.rangeError} />
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  types: { flexDirection: "row", gap: space.sm },
  typeChip: { flex: 1, justifyContent: "center" },
  presets: { gap: space.sm, paddingVertical: space.xxs },
  dates: { flexDirection: "row", gap: space.md },
  date: { flex: 1 },
})
