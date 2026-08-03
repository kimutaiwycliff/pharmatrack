import type { ReactNode } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"

export type ButtonVariant = "primary" | "secondary" | "danger"

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: ButtonVariant
  loading?: boolean
  disabled?: boolean
  // A already-rendered icon element (e.g. <Ionicons name="..." size={18} .../>)
  // shown before the title. Caller picks the color so it matches the variant.
  icon?: ReactNode
  style?: StyleProp<ViewStyle>
}

// Replaces the ad-hoc Pressable+Text button pattern used across screens.
// 'primary' -> theme.greenCta, 'secondary' -> theme.muted, 'danger' -> theme.red.
export function Button({ title, onPress, variant = "primary", loading = false, disabled = false, icon, style }: ButtonProps) {
  const theme = useTheme()
  const styles = createStyles(theme)
  const isDisabled = disabled || loading
  const textColor = variant === "secondary" ? theme.text : "#fff"

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
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
          {icon}
          <Text style={[styles.text, { color: textColor }]}>{title}</Text>
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
      gap: 8,
      borderRadius: 8,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    primary: { backgroundColor: theme.greenCta },
    secondary: { backgroundColor: theme.muted, borderWidth: 1, borderColor: theme.border },
    danger: { backgroundColor: theme.red },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
    text: { fontSize: 16, fontWeight: "600" },
  })
}
