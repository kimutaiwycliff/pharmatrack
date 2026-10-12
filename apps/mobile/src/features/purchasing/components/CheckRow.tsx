import Ionicons from "@expo/vector-icons/Ionicons"
import type { ReactNode } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { space, TOUCH_TARGET } from "../../../theme/tokens"

interface CheckRowProps {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  subtitle?: string | null
  /** Extra content beside the text (badges). */
  trailing?: ReactNode
}

// A tickable row (checkbox + label) — the receive form's "this line arrived"
// and "close the order anyway" toggles. Whole row is the 48dp target.
export function CheckRow({ checked, onChange, title, subtitle, trailing }: CheckRowProps) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={24} color={checked ? theme.green : theme.textTertiary} />
      <View style={styles.body}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH_TARGET, paddingVertical: space.xs },
  body: { flex: 1, gap: space.xxs },
})
