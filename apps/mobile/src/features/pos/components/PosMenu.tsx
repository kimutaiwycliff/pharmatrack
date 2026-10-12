import Ionicons from "@expo/vector-icons/Ionicons"
import type { ComponentProps } from "react"
import { StyleSheet, View } from "react-native"
import { Chip, ListRow, Sheet, Text } from "../../../components"
import { useTheme, useThemeMode, type ThemeMode } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"

type IconName = ComponentProps<typeof Ionicons>["name"]

export interface PosMenuAction {
  label: string
  icon: IconName
  onPress: () => void
  danger?: boolean
}

const MODES: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: "system", label: "System", icon: "phone-portrait-outline" },
  { mode: "light", label: "Light", icon: "sunny-outline" },
  { mode: "dark", label: "Dark", icon: "moon-outline" },
]

/** POS overflow menu: theme (light / dark / system) + screen actions. */
export function PosMenu({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: PosMenuAction[] }) {
  const theme = useTheme()
  const { mode, setMode } = useThemeMode()
  return (
    <Sheet open={open} onClose={onClose} title="Menu">
      <Text variant="label" tone="secondary">
        Appearance
      </Text>
      <View style={styles.modes} accessibilityRole="radiogroup">
        {MODES.map((m) => (
          <Chip
            key={m.mode}
            label={m.label}
            selected={mode === m.mode}
            icon={<Ionicons name={m.icon} size={16} color={mode === m.mode ? theme.green600 : theme.text} />}
            accessibilityLabel={`${m.label} theme`}
            onPress={() => setMode(m.mode)}
            style={styles.mode}
          />
        ))}
      </View>
      <View>
        {actions.map((a) => (
          <ListRow
            key={a.label}
            title={a.label}
            leading={<Ionicons name={a.icon} size={22} color={a.danger ? theme.red : theme.text} />}
            onPress={() => {
              onClose()
              a.onPress()
            }}
            style={styles.row}
          />
        ))}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  modes: { flexDirection: "row", gap: space.sm },
  mode: { flex: 1, justifyContent: "center" },
  row: { paddingHorizontal: 0 },
})
