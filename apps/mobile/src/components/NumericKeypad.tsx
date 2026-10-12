import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { haptics } from "../lib/haptics"
import { applyKeypadKey, type KeypadKey } from "../lib/keypad"
import { useTheme } from "../theme/useTheme"
import { radius, space } from "../theme/tokens"

interface NumericKeypadProps {
  value: string
  onChange: (value: string) => void
  maxLength?: number
  /** Hide the "00" key (quantities). */
  hideDoubleZero?: boolean
  /** Key height; 56 on phones, larger on tablets. */
  keyHeight?: number
}

const ROWS: KeypadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["00", "0", "back"],
]

// Big on-screen keypad used for cash tendered, quantities and amounts. It is
// NOT a TextInput, so a USB/Bluetooth scanner's keystrokes can never land in
// the tendered amount, and the system keyboard never covers the totals.
// Long-press ⌫ clears; a separate Clear key sits under the grid.
export function NumericKeypad({ value, onChange, maxLength = 7, hideDoubleZero, keyHeight = 56 }: NumericKeypadProps) {
  const theme = useTheme()
  const press = (key: KeypadKey) => {
    haptics.tick()
    onChange(applyKeypadKey(value, key, maxLength))
  }
  return (
    <View style={styles.grid}>
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((key) => {
            if (key === "00" && hideDoubleZero) return <View key={key} style={[styles.key, { height: keyHeight }]} />
            const isBack = key === "back"
            return (
              <Pressable
                key={key}
                onPress={() => press(key)}
                onLongPress={isBack ? () => press("clear") : undefined}
                accessibilityRole="button"
                accessibilityLabel={isBack ? "Delete" : key}
                accessibilityHint={isBack ? "Long press to clear" : undefined}
                style={({ pressed }) => [
                  styles.key,
                  { height: keyHeight, backgroundColor: pressed ? theme.mutedStrong : theme.surface, borderColor: theme.border },
                ]}
              >
                {isBack ? (
                  <Ionicons name="backspace-outline" size={26} color={theme.text} />
                ) : (
                  <Text style={[styles.keyText, { color: theme.text }]}>{key}</Text>
                )}
              </Pressable>
            )
          })}
        </View>
      ))}
      <Pressable
        onPress={() => press("clear")}
        accessibilityRole="button"
        accessibilityLabel="Clear"
        style={({ pressed }) => [styles.clear, { backgroundColor: pressed ? theme.mutedStrong : "transparent" }]}
      >
        <Text style={[styles.clearText, { color: theme.textSecondary }]}>Clear</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm },
  key: { flex: 1, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 26, fontWeight: "600", fontVariant: ["tabular-nums"] },
  clear: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  clearText: { fontSize: 15, fontWeight: "600" },
})
