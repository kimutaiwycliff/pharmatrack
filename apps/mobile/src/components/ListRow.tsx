import type { ReactNode } from "react"
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { useTheme } from "../theme/useTheme"
import { space, TOUCH_TARGET } from "../theme/tokens"
import { Text } from "./Text"

interface ListRowProps {
  title: string
  subtitle?: string | null
  leading?: ReactNode
  trailing?: ReactNode
  /** Extra content under the subtitle (badges, stock line…). */
  meta?: ReactNode
  onPress?: () => void
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
}

// Generic tappable row: leading slot, title/subtitle, trailing slot.
export function ListRow({ title, subtitle, leading, trailing, meta, onPress, disabled, accessibilityLabel, accessibilityHint, style }: ListRowProps) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={onPress ? { disabled: !!disabled } : undefined}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border },
        pressed && onPress ? { backgroundColor: theme.mutedStrong } : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {leading}
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta}
      </View>
      {trailing}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: TOUCH_TARGET + 16,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: space.xxs },
  disabled: { opacity: 0.45 },
})
