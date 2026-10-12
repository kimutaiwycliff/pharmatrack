import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, Text, View } from "react-native"
import { haptics } from "../lib/haptics"
import { applyKeypadKey, applyPinKey, type KeypadKey } from "../lib/keypad"
import { useTheme } from "../theme/useTheme"
import { radius, space } from "../theme/tokens"
import { PressableScale } from "./PressableScale"

interface NumericKeypadProps {
  value: string
  onChange: (value: string) => void
  maxLength?: number
  /** Hide the "00" key (quantities). */
  hideDoubleZero?: boolean
  /** Key height; 56 on phones, larger on tablets. */
  keyHeight?: number
  /** "pin": every digit counts (leading zeros kept), no "00" key. */
  mode?: "amount" | "pin"
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
export function NumericKeypad({ value, onChange, maxLength = 7, hideDoubleZero, keyHeight = 56, mode = "amount" }: NumericKeypadProps) {
  const theme = useTheme()
  const pin = mode === "pin"
  const noDoubleZero = hideDoubleZero || pin
  const press = (key: KeypadKey) => {
    haptics.tick()
    onChange(pin ? applyPinKey(value, key, maxLength) : applyKeypadKey(value, key, maxLength))
  }
  return (
    <View style={styles.grid}>
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((key) => {
            if (key === "00" && noDoubleZero) return <View key={key} style={[styles.key, { height: keyHeight }]} />
            const isBack = key === "back"
            return (
              <PressableScale
                key={key}
                scaleTo={0.94}
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
              </PressableScale>
            )
          })}
        </View>
      ))}
      <PressableScale
        onPress={() => press("clear")}
        accessibilityRole="button"
        accessibilityLabel="Clear"
        style={({ pressed }) => [styles.clear, { backgroundColor: pressed ? theme.mutedStrong : "transparent" }]}
      >
        <Text style={[styles.clearText, { color: theme.textSecondary }]}>Clear</Text>
      </PressableScale>
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
