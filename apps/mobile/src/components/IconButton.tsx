import Ionicons from "@expo/vector-icons/Ionicons"
import type { ComponentProps } from "react"
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native"
import { useTheme } from "../theme/useTheme"
import { radius, TOUCH_TARGET } from "../theme/tokens"

type IconName = ComponentProps<typeof Ionicons>["name"]

interface IconButtonProps {
  icon: IconName
  onPress: () => void
  // Required: an icon alone says nothing to TalkBack.
  accessibilityLabel: string
  accessibilityHint?: string
  variant?: "plain" | "tonal" | "filled" | "danger"
  size?: number
  color?: string
  disabled?: boolean
  selected?: boolean
  style?: StyleProp<ViewStyle>
}

// Square icon-only button that never drops below the 48dp touch target,
// whatever the icon size.
export function IconButton({
  icon, onPress, accessibilityLabel, accessibilityHint, variant = "plain", size = 22, color, disabled, selected, style,
}: IconButtonProps) {
  const theme = useTheme()
  const bg =
    variant === "filled" ? theme.greenCta : variant === "danger" ? theme.red50 : variant === "tonal" || selected ? theme.mutedStrong : "transparent"
  const fg = color ?? (variant === "filled" ? theme.onAccent : variant === "danger" ? theme.red : theme.text)
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      hitSlop={4}
      style={({ pressed }) => [styles.base, { backgroundColor: bg }, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <Ionicons name={icon} size={size} color={fg} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
})
