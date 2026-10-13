import type { ReactNode } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { useTheme } from "../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../theme/tokens"
import { PressableScale } from "./PressableScale"
import { Text } from "./Text"

interface ChipProps {
  label: string
  onPress?: () => void
  selected?: boolean
  icon?: ReactNode
  tone?: "default" | "warning" | "danger"
  disabled?: boolean
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

// Pill used for filters, quick-cash amounts, recent scans and line options.
// Pressable chips keep the 48dp hit area; static ones (no onPress) are badges.
export function Chip({ label, onPress, selected, icon, tone = "default", disabled, accessibilityLabel, style }: ChipProps) {
  const theme = useTheme()
  const border = selected ? theme.green : tone === "danger" ? theme.red : tone === "warning" ? theme.amber : theme.border
  const bg = selected ? theme.green50 : theme.surface
  const fg = selected ? theme.green600 : tone === "danger" ? theme.red : tone === "warning" ? theme.amber : theme.text
  const body = (
    <>
      {icon}
      <Text variant="label" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </>
  )
  if (!onPress) {
    return <View style={[styles.base, styles.static, { borderColor: border, backgroundColor: bg }, style]}>{body}</View>
  }
  return (
    <PressableScale
      onPress={onPress}
      pressGuardMs={300}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={[styles.base, styles.interactive, { borderColor: border, backgroundColor: bg }, disabled && styles.disabled, style]}
    >
      {body}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", gap: space.xs, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md },
  interactive: { minHeight: TOUCH_TARGET },
  static: { paddingVertical: space.xxs, alignSelf: "flex-start" },
  disabled: { opacity: 0.4 },
})
