import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useEffect, useMemo, useRef } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { scheduleOnRN } from "react-native-worklets"
import { useMotion } from "../lib/motion"
import { toastLabel, type ToastItem } from "../lib/toastQueue"
import { useToastStore, type ToastVariant } from "../store/toast"
import { useTheme } from "../theme/useTheme"
import { elevation, motion, radius, space, TOUCH_TARGET, type Theme } from "../theme/tokens"
import { Text } from "./Text"

const SWIPE_DISMISS_PX = 28
const SWIPE_DISMISS_VELOCITY = 600

// Mounted once at the app root (app/_layout.tsx), mirrors sonner's <Toaster/>
// on web — a single host renders whatever's queued in useToastStore, and
// ../lib/toast.ts's toast.success/error/info() is the imperative API used to
// queue one from anywhere (components or plain modules like store/cart.ts).
// Each toast is a live region so TalkBack reads it; tap or swipe up dismisses
// it. Motion: drops in from the top (critically-damped spring), fades up and
// out, the others re-flow (LinearTransition); a collapsed duplicate bumps.
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
  const translateY = useSharedValue(0)
  const fade = useSharedValue(1)
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

  const id = t.id
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(-8)
        .failOffsetY(12)
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          translateY.set(Math.min(0, e.translationY))
        })
        .onEnd((e) => {
          if (translateY.get() < -SWIPE_DISMISS_PX || e.velocityY < -SWIPE_DISMISS_VELOCITY) {
            fade.set(withTiming(0, { duration: motion.duration.fast }))
            translateY.set(
              withTiming(-80, { duration: motion.duration.fast }, () => {
                scheduleOnRN(onDismiss, id)
              }),
            )
          } else {
            translateY.set(withSpring(0, { ...motion.spring.snappy }))
          }
        }),
    [id, onDismiss, translateY, fade],
  )

  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: translateY.value }, { scale: bump.value }],
  }))

  const label = toastLabel(t)
  return (
    <GestureDetector gesture={pan}>
      <Animated.View entering={m.toastIn} exiting={m.toastOut} layout={m.layout} style={style}>
        <Pressable
          onPress={() => onDismiss(id)}
          accessibilityRole="alert"
          accessibilityLabel={label}
          accessibilityHint={t.action ? undefined : "Tap or swipe up to dismiss"}
          accessibilityLiveRegion={t.variant === "error" ? "assertive" : "polite"}
          style={[styles.toast, look.container]}
        >
          <Ionicons name={look.icon} size={20} color={look.fg} />
          <Text variant="label" style={[styles.text, { color: look.fg }]} numberOfLines={3}>
            {label}
          </Text>
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
        </Pressable>
      </Animated.View>
    </GestureDetector>
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
