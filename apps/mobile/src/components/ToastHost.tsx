import { Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useToastStore, type ToastVariant } from "../store/toast"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"

// Mounted once at the app root (app/_layout.tsx), mirrors sonner's <Toaster/>
// on web — a single host renders whatever's queued in useToastStore, and
// ../lib/toast.ts's toast.success/error/info() is the imperative API used to
// queue one from anywhere (components or plain modules like store/cart.ts).
export function ToastHost() {
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const styles = createStyles(theme)
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <View pointerEvents="box-none" style={[styles.root, { top: insets.top + 8 }]}>
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => dismiss(t.id)}
          style={[styles.toast, variantStyle(t.variant, styles)]}
        >
          <Text style={[styles.text, t.variant === "info" ? styles.infoText : styles.coloredText]}>{t.message}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function variantStyle(variant: ToastVariant, styles: ReturnType<typeof createStyles>) {
  if (variant === "success") return styles.success
  if (variant === "error") return styles.error
  return styles.info
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    root: { position: "absolute", left: 16, right: 16, gap: 8, zIndex: 999 },
    toast: {
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    success: { backgroundColor: theme.green },
    error: { backgroundColor: theme.red },
    info: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
    text: { fontSize: 14, fontWeight: "600" },
    coloredText: { color: "#fff" },
    infoText: { color: theme.text },
  })
}
