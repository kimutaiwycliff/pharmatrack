import { StyleSheet, View } from "react-native"
import { useTheme } from "../theme/useTheme"
import { radius, space, type Theme } from "../theme/tokens"
import { Text } from "./Text"

// Generic status keys (not POS-specific) so later phases can reuse this for
// Inventory's out-of-stock/low-stock/expiring badges, etc.
export type BadgeStatus = "ok" | "warning" | "danger" | "neutral"

interface StatusBadgeProps {
  status: BadgeStatus
  label: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const theme = useTheme()
  const colors = colorsFor(status, theme)
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]} accessible accessibilityRole="text" accessibilityLabel={label}>
      <Text variant="caption" style={[styles.label, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function colorsFor(status: BadgeStatus, theme: Theme) {
  switch (status) {
    case "ok":
      return { bg: theme.green50, border: theme.green100, text: theme.green600 }
    case "warning":
      return { bg: theme.muted, border: theme.amber, text: theme.amber }
    case "danger":
      return { bg: theme.red50, border: theme.red50, text: theme.red }
    case "neutral":
      return { bg: theme.muted, border: theme.border, text: theme.textSecondary }
  }
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm + 2,
  },
  label: { fontWeight: "600" },
})
