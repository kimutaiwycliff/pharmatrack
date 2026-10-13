import Ionicons from "@expo/vector-icons/Ionicons"
import { useRef, type ComponentProps } from "react"
import { StyleSheet, View } from "react-native"
import { Pressable } from "react-native-gesture-handler"
import { router } from "expo-router"
import { Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { radius, space, TOUCH_TARGET, type Theme } from "../../../theme/tokens"
import type { DashboardResponse } from "../types"

type AlertKey = keyof DashboardResponse["alerts"]

const ALERTS: { key: AlertKey; status: "out_of_stock" | "low_stock" | "expiring"; label: string; icon: ComponentProps<typeof Ionicons>["name"]; tone: "danger" | "warning" }[] = [
  { key: "outOfStock", status: "out_of_stock", label: "Out of stock", icon: "close-circle-outline", tone: "danger" },
  { key: "lowStock", status: "low_stock", label: "Low stock", icon: "alert-circle-outline", tone: "warning" },
  { key: "expiring", status: "expiring", label: "Expiring ≤ 90 days", icon: "time-outline", tone: "warning" },
]

function colors(tone: "danger" | "warning", active: boolean, theme: Theme) {
  if (!active) return { fg: theme.textSecondary, border: theme.border }
  return tone === "danger" ? { fg: theme.red, border: theme.red } : { fg: theme.amber, border: theme.amber }
}

// The dashboard's inventory alerts (web shows them as pills under the KPIs).
// Each card opens the Inventory tab already filtered to that status. People
// without products.view (no Inventory tab) see the counts without the link.
export function StockAlerts({ alerts, canOpenInventory }: { alerts: DashboardResponse["alerts"]; canOpenInventory: boolean }) {
  const theme = useTheme()
  // Raw Pressable (not ListRow/Button), so it gets its own double-tap guard.
  const opening = useRef(false)
  const open = (status: string) => {
    if (opening.current) return
    opening.current = true
    setTimeout(() => {
      opening.current = false
    }, 600)
    router.push({ pathname: "/inventory", params: { status } })
  }
  return (
    <View style={styles.row}>
      {ALERTS.map((a) => {
        const count = alerts[a.key]
        const c = colors(a.tone, count > 0, theme)
        const body = (
          <>
            <View style={styles.top}>
              <Ionicons name={a.icon} size={18} color={c.fg} />
              <Text variant="headline" tabular style={{ color: c.fg }}>
                {count}
              </Text>
            </View>
            <Text variant="caption" tone="secondary" numberOfLines={2}>
              {a.label}
            </Text>
          </>
        )
        const label = `${count} ${a.label.toLowerCase()}`
        if (!canOpenInventory) {
          return (
            <View key={a.key} style={[styles.card, { borderColor: c.border, backgroundColor: theme.surface }]} accessible accessibilityLabel={label}>
              {body}
            </View>
          )
        }
        return (
          <Pressable
            key={a.key}
            onPress={() => open(a.status)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Opens Inventory filtered to these products"
            style={({ pressed }) => [styles.card, { borderColor: c.border, backgroundColor: pressed ? theme.mutedStrong : theme.surface }]}
          >
            {body}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  card: { flex: 1, minHeight: TOUCH_TARGET + 24, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.xs },
  top: { flexDirection: "row", alignItems: "center", gap: space.xs },
})
