import Ionicons from "@expo/vector-icons/Ionicons"
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker"
import { Platform, Pressable, StyleSheet, View } from "react-native"
import { formatDay, formatTime } from "../lib/dates"
import { useTheme } from "../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../theme/tokens"
import { Text } from "./Text"

interface DateFieldProps {
  label: string
  value: Date | null
  onChange: (date: Date) => void
  /** "datetime" asks for the date, then the time (Android has no combined dialog). */
  mode?: "date" | "time" | "datetime"
  minimumDate?: Date
  maximumDate?: Date
  placeholder?: string
  helper?: string | null
  error?: string | null
  disabled?: boolean
}

// R3: labelled date/time input in the TextField style. Android opens the
// native Material dialog imperatively (no hidden component to mount); iOS
// shows the compact native picker inline.
export function DateField({ label, value, onChange, mode = "date", minimumDate, maximumDate, placeholder = "Choose…", helper, error, disabled }: DateFieldProps) {
  const theme = useTheme()
  const display = value
    ? mode === "time"
      ? formatTime(value)
      : mode === "datetime"
        ? `${formatDay(value)}, ${formatTime(value)}`
        : formatDay(value)
    : null

  function openAndroid() {
    const start = value ?? minimumDate ?? new Date()
    const pickTime = (base: Date) =>
      DateTimePickerAndroid.open({
        value: base,
        mode: "time",
        is24Hour: true,
        onValueChange: (_e, t) => {
          const d = new Date(base)
          d.setHours(t.getHours(), t.getMinutes(), 0, 0)
          onChange(d)
        },
      })
    if (mode === "time") {
      pickTime(start)
      return
    }
    DateTimePickerAndroid.open({
      value: start,
      mode: "date",
      minimumDate,
      maximumDate,
      onValueChange: (_e, picked) => {
        const d = new Date(picked)
        // Keep the previously chosen time-of-day when only the date changes.
        if (value) d.setHours(value.getHours(), value.getMinutes(), 0, 0)
        if (mode === "datetime") pickTime(d)
        else onChange(d)
      },
    })
  }

  const borderColor = error ? theme.red : theme.border
  const a11yValue = display ?? "not set"

  return (
    <View style={styles.container}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      {Platform.OS === "ios" ? (
        <View style={[styles.field, { borderColor, backgroundColor: theme.surface }]}>
          <DateTimePicker
            value={value ?? minimumDate ?? new Date()}
            mode={mode}
            display="compact"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onValueChange={(_e, d) => onChange(d)}
            accessibilityLabel={label}
            disabled={disabled}
          />
        </View>
      ) : (
        <Pressable
          onPress={openAndroid}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${a11yValue}${error ? `, error: ${error}` : ""}`}
          accessibilityHint="Opens a date picker"
          style={({ pressed }) => [
            styles.field,
            { borderColor, backgroundColor: pressed ? theme.mutedStrong : theme.surface },
            disabled && styles.disabled,
          ]}
        >
          <Ionicons name={mode === "time" ? "time-outline" : "calendar-outline"} size={18} color={theme.textSecondary} />
          <Text style={styles.value} tone={display ? "default" : "tertiary"}>
            {display ?? placeholder}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.textTertiary} />
        </Pressable>
      )}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="secondary">
          {helper}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: TOUCH_TARGET,
  },
  value: { flex: 1 },
  disabled: { opacity: 0.5 },
})
