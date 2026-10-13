import { useMemo } from "react"
import { StyleSheet } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import Animated from "react-native-reanimated"
import { useShallow } from "zustand/react/shallow"
import { useMotion } from "../lib/motion"
import { useSyncStore } from "../store/sync"
import { nairobiClock } from "../lib/sync/core/format"
import { useTheme } from "../theme/useTheme"
import { radius, space, TOUCH_TARGET, type Theme } from "../theme/tokens"
import { PressableScale } from "./PressableScale"
import { Text } from "./Text"

// Persistent, non-blocking sync notices (R1 rules 3 + 5): the 21:00 "sync
// before midnight" warning, a shift that was closed offline and still has to
// upload, a manager unlock in force, and a lapsed subscription. Each opens
// the sync screen. Renders nothing when there's nothing to say.
// Motion: each banner rises in / fades out and the rest re-flow, so the screen
// below slides rather than jumps.
export function SyncBanners() {
  const theme = useTheme()
  const m = useMotion()
  const styles = useMemo(() => createStyles(theme), [theme])
  const { hasDevice, warnDeadline, underOverride, pendingSales, pendingShiftCloses, override, subscriptionInactive } = useSyncStore(
    useShallow((s) => ({
      hasDevice: !!s.device,
      warnDeadline: s.lock.warnDeadline,
      underOverride: s.lock.underOverride,
      pendingSales: s.pendingSales,
      pendingShiftCloses: s.pendingShiftCloses,
      override: s.override,
      subscriptionInactive: s.subscriptionInactive,
    })),
  )
  if (!hasDevice) return null

  const banners: { key: string; icon: keyof typeof Ionicons.glyphMap; text: string; tone: "warn" | "danger" }[] = []
  if (warnDeadline && pendingSales > 0) {
    banners.push({
      key: "deadline",
      icon: "alarm-outline",
      text: `Sync before midnight — ${pendingSales} sale${pendingSales === 1 ? "" : "s"} waiting`,
      tone: "warn",
    })
  }
  if (pendingShiftCloses > 0) {
    banners.push({ key: "shift", icon: "cloud-upload-outline", text: "Shift closed — waiting to sync. Connect to upload it.", tone: "warn" })
  }
  if (underOverride && override) {
    banners.push({
      key: "override",
      icon: "key-outline",
      text: `Unlocked by ${override.manager_name} until ${nairobiClock(override.until)} — sync as soon as you can`,
      tone: "warn",
    })
  }
  if (subscriptionInactive) {
    banners.push({ key: "sub", icon: "card-outline", text: "Subscription inactive — renew to keep syncing", tone: "danger" })
  }
  if (banners.length === 0) return null

  return (
    <Animated.View style={styles.wrap} layout={m.layout} entering={m.riseIn} exiting={m.fadeOut}>
      {banners.map((b) => (
        <Animated.View key={b.key} entering={m.riseIn} exiting={m.fadeOut} layout={m.layout}>
          <PressableScale
            onPress={() => router.push("/sync")}
            pressGuardMs={600}
            scaleTo={0.985}
            style={[styles.banner, b.tone === "danger" ? styles.danger : styles.warn]}
            accessibilityRole="button"
            accessibilityLabel={b.text}
            accessibilityHint="Opens sync details"
          >
            <Ionicons name={b.icon} size={18} color={b.tone === "danger" ? theme.red : theme.amber} />
            <Text variant="label" style={styles.text}>
              {b.text}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </PressableScale>
        </Animated.View>
      ))}
    </Animated.View>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { gap: space.xs + 2 },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      minHeight: TOUCH_TARGET,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    warn: { borderColor: theme.amber, backgroundColor: theme.muted },
    danger: { borderColor: theme.red, backgroundColor: theme.red50 },
    text: { flex: 1 },
  })
}
