import type { ReactNode } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native"
import { useTheme } from "../theme/useTheme"
import { radius, space, TOUCH_TARGET, type Theme } from "../theme/tokens"

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
}

// Replaces the ad-hoc Pressable+Text button pattern used across screens.
// 'primary' -> theme.greenCta, 'secondary' -> theme.muted, 'ghost' -> no
// fill, 'danger' -> theme.red. Every size is at least the 48dp touch target
// ("sm" only tightens padding/text, not the hit area).
export function Button({
  title, onPress, variant = "primary", size = "md", loading = false, disabled = false, icon, leadingIcon, accessibilityLabel,
  accessibilityHint, style,
}: ButtonProps) {
  const theme = useTheme()
  const styles = createStyles(theme)
  const isDisabled = disabled || loading
  const textColor = variant === "secondary" || variant === "ghost" ? theme.text : "#fff"
  const lead = leadingIcon ?? icon

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {lead}
          <Text style={[styles.text, styles[`${size}Text`], { color: textColor }]}>{title}</Text>
        </>
      )}
    </Pressable>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: space.sm,
      borderRadius: radius.md,
      minHeight: TOUCH_TARGET,
    },
    sm: { paddingVertical: space.sm, paddingHorizontal: space.md },
    md: { paddingVertical: 14, paddingHorizontal: space.lg },
    lg: { paddingVertical: 18, paddingHorizontal: space.xl, minHeight: 60, borderRadius: radius.lg },
    primary: { backgroundColor: theme.greenCta },
    secondary: { backgroundColor: theme.muted, borderWidth: 1, borderColor: theme.border },
    ghost: { backgroundColor: "transparent" },
    danger: { backgroundColor: theme.red },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
    text: { fontSize: 16, fontWeight: "600" },
    smText: { fontSize: 14 },
    mdText: { fontSize: 16 },
    lgText: { fontSize: 19, fontWeight: "700" },
  })
}
