import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import type { ComponentProps } from "react"
import { StyleSheet, View } from "react-native"
import type { DeviceHealth } from "@pharmatrack/core"
import { useDeviceHealth } from "../lib/hardware/useDeviceHealth"
import { useTheme } from "../theme/useTheme"
import { radius, space } from "../theme/tokens"
import { PressableScale } from "./PressableScale"
import { Text } from "./Text"

type IconName = ComponentProps<typeof Ionicons>["name"]

// POS header: receipt printer + barcode scanner at a glance. A coloured dot
// (green ready / amber check / red offline); problems also spell out their
// label. Tapping opens Settings → Printer & scanner.
export function DeviceStatusBadges() {
  const { printer, scanner, configured } = useDeviceHealth()
  return (
    <View style={styles.row}>
      {configured ? <Badge icon="print-outline" health={printer} /> : null}
      {scanner.tone !== "none" ? <Badge icon="barcode-outline" health={scanner} /> : null}
    </View>
  )
}

function Badge({ icon, health }: { icon: IconName; health: DeviceHealth }) {
  const theme = useTheme()
  const dot = health.tone === "ok" ? theme.green : health.tone === "warn" ? theme.amber : health.tone === "down" ? theme.red : theme.textTertiary
  const problem = health.tone === "warn" || health.tone === "down"
  return (
    <PressableScale
      onPress={() => router.push("/settings/hardware")}
      pressGuardMs={400}
      accessibilityRole="button"
      accessibilityLabel={`${health.label}. ${health.detail ?? ""}`}
      accessibilityHint="Opens printer and scanner settings"
      hitSlop={4}
      style={[styles.badge, problem && { backgroundColor: health.tone === "down" ? theme.red50 : theme.mutedStrong }]}
    >
      <View>
        <Ionicons name={icon} size={20} color={theme.text} />
        <View style={[styles.dot, { backgroundColor: dot, borderColor: theme.bg }]} />
      </View>
      {problem ? (
        <Text variant="caption" tone={health.tone === "down" ? "danger" : "warning"} numberOfLines={1}>
          {health.label}
        </Text>
      ) : null}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  badge: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs,
    minHeight: 44, minWidth: 44, paddingHorizontal: space.sm, borderRadius: radius.pill,
  },
  dot: { position: "absolute", right: -2, bottom: -1, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
})
