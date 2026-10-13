import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Pressable } from "react-native-gesture-handler"
import { ListRow, Sheet, Text, TextField } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../../../theme/tokens"

export interface PickerOption {
  id: string
  label: string
  /** Indented (e.g. a sub-category under its parent). */
  child?: boolean
}

interface PickerFieldProps {
  label: string
  value: string | null
  options: PickerOption[]
  onChange: (id: string | null) => void
  /** Label for the "nothing selected" choice. */
  noneLabel?: string
  helper?: string
  loading?: boolean
}

// A select field: looks like a TextField, opens a bottom sheet of choices
// (searchable once the list is long). Used for category and supplier.
export function PickerField({ label, value, options, onChange, noneLabel = "None", helper, loading }: PickerFieldProps) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const selected = options.find((o) => o.id === value)
  const t = q.trim().toLowerCase()
  const shown = t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options

  function pick(id: string | null) {
    onChange(id)
    setOpen(false)
    setQ("")
  }

  return (
    <View style={styles.container}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? noneLabel}`}
        accessibilityHint="Opens the list of choices"
        style={[styles.field, { borderColor: theme.border, backgroundColor: theme.surface }]}
      >
        <Text style={styles.value} tone={selected ? "default" : "tertiary"} numberOfLines={1}>
          {loading ? "Loading…" : (selected?.label ?? noneLabel)}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
      </Pressable>
      {helper ? (
        <Text variant="caption" tone="secondary">
          {helper}
        </Text>
      ) : null}

      <Sheet open={open} onClose={() => setOpen(false)} title={label} snapPoints={["70%"]} scrollable>
        {options.length > 8 ? <TextField label={`Search ${label.toLowerCase()}`} hideLabel placeholder="Search…" value={q} onChangeText={setQ} inSheet /> : null}
        <View>
          <ListRow
            title={noneLabel}
            onPress={() => pick(null)}
            trailing={value === null ? <Ionicons name="checkmark" size={20} color={theme.green600} /> : null}
            accessibilityLabel={`${noneLabel}${value === null ? ", selected" : ""}`}
          />
          {shown.map((o) => (
            <ListRow
              key={o.id}
              title={o.label}
              onPress={() => pick(o.id)}
              style={o.child ? styles.child : undefined}
              trailing={o.id === value ? <Ionicons name="checkmark" size={20} color={theme.green600} /> : null}
              accessibilityLabel={`${o.label}${o.id === value ? ", selected" : ""}`}
            />
          ))}
          {shown.length === 0 && t ? (
            <Text tone="secondary" style={styles.none}>
              Nothing matches “{q.trim()}”.
            </Text>
          ) : null}
        </View>
      </Sheet>
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
  child: { paddingLeft: space.xxl },
  none: { padding: space.lg },
})
