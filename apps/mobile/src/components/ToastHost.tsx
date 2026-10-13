import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useEffect, useMemo, useRef } from "react"
import { StyleSheet, View } from "react-native"
import { Pressable } from "react-native-gesture-handler"
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useMotion } from "../lib/motion"
import { toastLabel, type ToastItem } from "../lib/toastQueue"
import { useToastStore, type ToastVariant } from "../store/toast"
import { useTheme } from "../theme/useTheme"
import { elevation, motion, radius, space, TOUCH_TARGET, type Theme } from "../theme/tokens"
import { Text } from "./Text"

// Mounted once at the app root (app/_layout.tsx), mirrors sonner's <Toaster/>
// on web — a single host renders whatever's queued in useToastStore, and
// ../lib/toast.ts's toast.success/error/info() is the imperative API used to
// queue one from anywhere (components or plain modules like store/cart.ts).
// Each toast is a live region so TalkBack reads it, and leaves on its own timer.
//
// Toasts sit over the screen header (the till's scan/menu buttons and search),
// so they never take a tap: touches fall through to whatever is underneath and
// only an action button (e.g. Undo) is pressable. Previously a tap aimed at the
// header just dismissed the toast — one of the "tap twice" causes.
// Motion: drops in from the top (critically-damped spring), fades up and out,
// the others re-flow (LinearTransition); a collapsed duplicate bumps.
export function ToastHost() {
  const insets = useSafeAreaInsets()
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <View pointerEvents="box-none" style={[styles.root, { top: insets.top + space.sm }]}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </View>
  )
}

const Toast = memo(function Toast({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const theme = useTheme()
  const m = useMotion()
  const look = useMemo(() => variantLook(t.variant, theme), [t.variant, theme])
  const bump = useSharedValue(1)

  // A duplicate was folded into this toast: a small, non-wobbly bump.
  const lastCount = useRef(t.count)
  useEffect(() => {
    if (t.count === lastCount.current) return
    lastCount.current = t.count
    if (m.reduced) return
    bump.value = withSequence(
      withTiming(1.04, { duration: motion.duration.fast / 2, reduceMotion: ReduceMotion.Never }),
      withSpring(1, { ...motion.spring.snappy, reduceMotion: ReduceMotion.Never }),
    )
  }, [t.count, m.reduced, bump])

  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }))

  const id = t.id
  const label = toastLabel(t)
  return (
    <Animated.View entering={m.toastIn} exiting={m.toastOut} layout={m.layout} style={style} pointerEvents="box-none">
      <View
        pointerEvents="box-none"
        accessible
        accessibilityRole="alert"
        accessibilityLabel={label}
        accessibilityLiveRegion={t.variant === "error" ? "assertive" : "polite"}
        style={[styles.toast, look.container]}
      >
        <View pointerEvents="none" style={styles.message}>
          <Ionicons name={look.icon} size={20} color={look.fg} />
          <Text variant="label" style={[styles.text, { color: look.fg }]} numberOfLines={3}>
            {label}
          </Text>
        </View>
        {t.action ? (
          <Pressable
            onPress={() => {
              t.action?.onPress()
              onDismiss(id)
            }}
            accessibilityRole="button"
            accessibilityLabel={t.action.label}
            hitSlop={8}
            style={({ pressed }) => [styles.action, { borderColor: look.fg }, pressed && styles.actionPressed]}
          >
            <Text variant="label" style={{ color: look.fg }}>
              {t.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  )
})

function variantLook(variant: ToastVariant, theme: Theme) {
  if (variant === "success") {
    return { container: { backgroundColor: theme.greenCta }, fg: theme.onAccent, icon: "checkmark-circle" as const }
  }
  if (variant === "error") {
    return { container: { backgroundColor: theme.red }, fg: theme.onAccent, icon: "alert-circle" as const }
  }
  return {
    container: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
    fg: theme.text,
    icon: "information-circle-outline" as const,
  }
}

const styles = StyleSheet.create({
  root: { position: "absolute", left: space.lg, right: space.lg, gap: space.sm, zIndex: 999 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md + 2,
    ...elevation.md,
  },
  message: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  text: { flex: 1 },
  action: {
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPressed: { opacity: 0.7 },
})
