import { StyleSheet, Switch, View } from "react-native"
import { Pressable } from "react-native-gesture-handler"
import { Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../../../theme/tokens"

interface ToggleRowProps {
  label: string
  description?: string
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

// A labelled switch row (web's <Toggle>): the whole row is the hit target and
// TalkBack hears it as one switch with its description.
export function ToggleRow({ label, description, value, onChange, disabled }: ToggleRowProps) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface }, disabled && styles.disabled]}
    >
      <View style={styles.text}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: theme.borderStrong, true: theme.green }}
        thumbColor={theme.surface}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: TOUCH_TARGET + 8,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  text: { flex: 1, gap: space.xxs },
  disabled: { opacity: 0.5 },
})
