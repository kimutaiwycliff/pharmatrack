import { useEffect, useMemo, useState } from "react"
import { StyleSheet } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"
import { useShallow } from "zustand/react/shallow"
import { useMotion } from "../lib/motion"
import { useSyncStore } from "../store/sync"
import { countdown, timeAgo } from "../lib/sync/core/format"
import { useTheme } from "../theme/useTheme"
import { motion, radius, space, TOUCH_TARGET, type Theme } from "../theme/tokens"
import { PressableScale } from "./PressableScale"
import { Text } from "./Text"

// Compact sync indicator for the POS header and Shifts tab (R1 rule 10):
// online/offline dot, "Synced 5 min ago", pending badge and — from 21:00 — a
// countdown to the midnight deadline. Tapping opens the full sync screen.
// Motion: the dot breathes while a sync runs; badges pop in/out.
export function SyncStatusBar() {
  const theme = useTheme()
  const m = useMotion()
  const styles = useMemo(() => createStyles(theme), [theme])
  const { online, status, lastSyncAt, pendingCount, rejectedCount, warnDeadline, msToDeadline, device } = useSyncStore(
    useShallow((s) => ({
      online: s.online,
      status: s.status,
      lastSyncAt: s.lastSyncAt,
      pendingCount: s.pendingCount,
      rejectedCount: s.rejectedCount,
      warnDeadline: s.lock.warnDeadline,
      msToDeadline: s.lock.msToDeadline,
      device: s.device,
    })),
  )
  const syncing = status === "syncing"
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (!syncing || m.reduced) {
      cancelAnimation(pulse)
      pulse.value = withTiming(1, { duration: motion.duration.fast })
      return
    }
    pulse.value = withRepeat(withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.Never }), -1, true)
    return () => cancelAnimation(pulse)
  }, [syncing, m.reduced, pulse])
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))
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
    <PressableScale
      onPress={() => router.push("/sync")}
      pressGuardMs={600}
      scaleTo={0.98}
      style={styles.bar}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Open sync details`}
    >
      <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dotStyle]} />
      <Text variant="caption" style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {warnDeadline && msToDeadline != null ? (
        <Animated.View entering={m.popIn} exiting={m.popOut} style={[styles.badge, styles.badgeWarn]}>
          <Ionicons name="alarm-outline" size={12} color={theme.amber} />
          <Text variant="caption" style={[styles.badgeText, { color: theme.amber }]}>{countdown(msToDeadline)}</Text>
        </Animated.View>
      ) : null}
      {pendingCount > 0 ? (
        <Animated.View entering={m.popIn} exiting={m.popOut} style={[styles.badge, styles.badgeWarn]}>
          <Text variant="caption" style={[styles.badgeText, { color: theme.amber }]}>{pendingCount} waiting</Text>
        </Animated.View>
      ) : null}
      {rejectedCount > 0 ? (
        <Animated.View entering={m.popIn} exiting={m.popOut} style={[styles.badge, styles.badgeDanger]}>
          <Text variant="caption" style={[styles.badgeText, { color: theme.red }]}>{rejectedCount} need attention</Text>
        </Animated.View>
      ) : null}
      <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
    </PressableScale>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs + 2,
      minHeight: TOUCH_TARGET,
      paddingHorizontal: space.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      flexShrink: 1,
    },
    dot: { width: 10, height: 10, borderRadius: 5 },
    label: { flexShrink: 1, fontSize: 13, fontWeight: "600" },
    badge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: space.xxs, borderWidth: 1 },
    badgeWarn: { borderColor: theme.amber, backgroundColor: theme.muted },
    badgeDanger: { borderColor: theme.red, backgroundColor: theme.red50 },
    badgeText: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
  })
}
