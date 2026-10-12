import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useToastStore, type ToastVariant } from "../store/toast"
import { useTheme } from "../theme/useTheme"
import { elevation, radius, space, TOUCH_TARGET, type Theme } from "../theme/tokens"
import { Text } from "./Text"

// Mounted once at the app root (app/_layout.tsx), mirrors sonner's <Toaster/>
// on web — a single host renders whatever's queued in useToastStore, and
// ../lib/toast.ts's toast.success/error/info() is the imperative API used to
// queue one from anywhere (components or plain modules like store/cart.ts).
// Each toast is a live region so TalkBack reads it; tap dismisses it.
export function ToastHost() {
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <View pointerEvents="box-none" style={[styles.root, { top: insets.top + space.sm }]}>
      {toasts.map((t) => {
        const look = variantLook(t.variant, theme)
        return (
          <Pressable
            key={t.id}
            onPress={() => dismiss(t.id)}
            accessibilityRole="alert"
            accessibilityLabel={t.message}
            accessibilityHint="Tap to dismiss"
            accessibilityLiveRegion={t.variant === "error" ? "assertive" : "polite"}
            style={({ pressed }) => [styles.toast, look.container, pressed && styles.pressed]}
          >
            <Ionicons name={look.icon} size={20} color={look.fg} />
            <Text variant="label" style={[styles.text, { color: look.fg }]}>
              {t.message}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

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
  pressed: { opacity: 0.85 },
  text: { flex: 1 },
})
