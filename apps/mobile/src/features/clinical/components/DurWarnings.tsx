import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { StatusBadge, Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { DUR_TYPE_LABEL, durBadge, hasSevere, sortWarnings } from "../logic/prescriptions"
import type { DurFinding } from "../types"

interface DurWarningsProps {
  warnings: DurFinding[]
  title: string
  subtitle?: string
}

// Drug Utilization Review findings, severe first, each with a severity badge
// (red / amber / grey — web's SEV_STYLES). The box takes the colour of the
// worst finding so a severe one is impossible to miss.
export function DurWarnings({ warnings, title, subtitle }: DurWarningsProps) {
  const theme = useTheme()
  if (warnings.length === 0) return null
  const severe = hasSevere(warnings)
  const accent = severe ? theme.red : theme.amber
  return (
    <View
      style={[styles.box, { borderColor: accent, backgroundColor: severe ? theme.red50 : theme.muted }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.head}>
        <Ionicons name="warning-outline" size={20} color={accent} />
        <Text variant="bodyStrong" tone={severe ? "danger" : "warning"} style={styles.flex} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text variant="caption" tone="secondary">
          {subtitle}
        </Text>
      ) : null}
      {sortWarnings(warnings).map((w, i) => {
        const badge = durBadge(w.severity)
        const type = DUR_TYPE_LABEL[w.type] ?? w.type
        return (
          <View
            key={`${w.type}-${i}`}
            style={[styles.row, { borderTopColor: theme.border }]}
            accessible
            accessibilityLabel={`${badge.label} ${type}: ${w.message}`}
          >
            <View style={styles.badges}>
              <StatusBadge status={badge.status} label={badge.label} />
              <Text variant="caption" tone="secondary">
                {type}
              </Text>
            </View>
            <Text>{w.message}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  row: { gap: space.xs, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  badges: { flexDirection: "row", alignItems: "center", gap: space.sm },
})
