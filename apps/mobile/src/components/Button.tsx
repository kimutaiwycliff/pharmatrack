import { useEffect, useMemo, type ReactNode } from "react"
import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { useMotion } from "../lib/motion"
import { useTheme } from "../theme/useTheme"
import { radius, space, TOUCH_TARGET, type Theme } from "../theme/tokens"
import { PressableScale, type PressHaptic } from "./PressableScale"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  // A already-rendered icon element (e.g. <Ionicons name="..." size={18} .../>)
  // shown before the title. Caller picks the color so it matches the variant.
  icon?: ReactNode
  /** Alias of `icon` (R2 naming). */
  leadingIcon?: ReactNode
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
  /** Optional haptic on press. */
  haptic?: PressHaptic
}

// Replaces the ad-hoc Pressable+Text button pattern used across screens.
// 'primary' -> theme.greenCta, 'secondary' -> theme.muted, 'ghost' -> no
// fill, 'danger' -> theme.red. Every size is at least the 48dp touch target
// ("sm" only tightens padding/text, not the hit area).
// Motion: scales on press (PressableScale). While loading the label stays in
// the layout (faded out) and a spinner fades in on top, so the button never
// changes width mid-checkout.
export function Button({
  title, onPress, variant = "primary", size = "md", loading = false, disabled = false, icon, leadingIcon, accessibilityLabel,
  accessibilityHint, style, haptic,
}: ButtonProps) {
  const theme = useTheme()
  const m = useMotion()
  const styles = useMemo(() => createStyles(theme), [theme])
  const isDisabled = disabled || loading
  const textColor = variant === "secondary" || variant === "ghost" ? theme.text : theme.onAccent
  const lead = leadingIcon ?? icon

  const busy = useSharedValue(loading ? 1 : 0)
  useEffect(() => {
    busy.value = m.timing(loading ? 1 : 0, "fast")
  }, [loading, busy, m])
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - busy.value }))
  const spinnerStyle = useAnimatedStyle(() => ({ opacity: busy.value }))

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[styles.base, styles[size], styles[variant], disabled && !loading && styles.disabled, style]}
    >
      <Animated.View style={[styles.content, labelStyle]}>
        {lead}
        <Text style={[styles.text, styles[`${size}Text`], { color: textColor }]}>{title}</Text>
      </Animated.View>
      {loading ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.spinner, spinnerStyle]} pointerEvents="none">
          <ActivityIndicator color={textColor} />
        </Animated.View>
      ) : null}
    </PressableScale>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      minHeight: TOUCH_TARGET,
    },
    content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, flexShrink: 1 },
    spinner: { alignItems: "center", justifyContent: "center" },
    sm: { paddingVertical: space.sm, paddingHorizontal: space.md },
    md: { paddingVertical: 14, paddingHorizontal: space.lg },
    lg: { paddingVertical: 18, paddingHorizontal: space.xl, minHeight: 60, borderRadius: radius.lg },
    primary: { backgroundColor: theme.greenCta },
    secondary: { backgroundColor: theme.muted, borderWidth: 1, borderColor: theme.border },
    ghost: { backgroundColor: "transparent" },
    danger: { backgroundColor: theme.red },
    disabled: { opacity: 0.5 },
    text: { fontSize: 16, fontWeight: "600" },
    smText: { fontSize: 14 },
    mdText: { fontSize: 16 },
    lgText: { fontSize: 19, fontWeight: "700" },
  })
}
