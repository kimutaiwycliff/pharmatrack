import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useSyncStore } from "../store/sync"
import { countdown, timeAgo } from "../lib/sync/core/format"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"

// Compact sync indicator for the POS header and Shifts tab (R1 rule 10):
// online/offline dot, "Synced 5 min ago", pending badge and — from 21:00 — a
// countdown to the midnight deadline. Tapping opens the full sync screen.
export function SyncStatusBar() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { online, status, lastSyncAt, pendingCount, rejectedCount, lock, device } = useSyncStore()
  // Re-render every 30s so "x min ago" and the countdown stay current.
  const [, setNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const dotColor =
    status === "revoked" || status === "error" ? theme.red : !online || status === "offline" ? theme.textTertiary : theme.green
  const label = !device
    ? "Phone not registered"
    : status === "syncing"
      ? "Syncing…"
      : status === "revoked"
        ? "Phone removed — register again"
        : !online || status === "offline"
          ? `Offline · synced ${timeAgo(lastSyncAt)}`
          : lastSyncAt
            ? `Synced ${timeAgo(lastSyncAt)}`
            : "Not synced yet"

  return (
    <Pressable
      onPress={() => router.push("/sync")}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Open sync details`}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {lock.warnDeadline && lock.msToDeadline != null ? (
        <View style={[styles.badge, styles.badgeWarn]}>
          <Ionicons name="alarm-outline" size={12} color={theme.amber} />
          <Text style={[styles.badgeText, { color: theme.amber }]}>{countdown(lock.msToDeadline)}</Text>
        </View>
      ) : null}
      {pendingCount > 0 ? (
        <View style={[styles.badge, styles.badgeWarn]}>
          <Text style={[styles.badgeText, { color: theme.amber }]}>{pendingCount} waiting</Text>
        </View>
      ) : null}
      {rejectedCount > 0 ? (
        <View style={[styles.badge, styles.badgeDanger]}>
          <Text style={[styles.badgeText, { color: theme.red }]}>{rejectedCount} need attention</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
    </Pressable>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 48,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      flexShrink: 1,
    },
    pressed: { opacity: 0.8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    label: { flexShrink: 1, fontSize: 13, fontWeight: "600", color: theme.text },
    badge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    badgeWarn: { borderColor: theme.amber, backgroundColor: theme.muted },
    badgeDanger: { borderColor: theme.red, backgroundColor: theme.red50 },
    badgeText: { fontSize: 11, fontWeight: "700" },
  })
}
