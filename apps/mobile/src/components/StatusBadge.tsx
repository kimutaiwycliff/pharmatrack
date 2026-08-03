import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"

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
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  )
}

function colorsFor(status: BadgeStatus, theme: Theme) {
  switch (status) {
    case "ok":
      return { bg: theme.green50, border: theme.green100, text: theme.green }
    case "warning":
      return { bg: theme.muted, border: theme.border, text: theme.amber }
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
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  label: { fontSize: 12, fontWeight: "600" },
})
