import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { Pressable } from "react-native-gesture-handler"
import { haptics } from "../lib/haptics"
import { keypadNumber } from "../lib/keypad"
import { useTheme } from "../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../theme/tokens"
import { Button } from "./Button"
import { IconButton } from "./IconButton"
import { NumericKeypad } from "./NumericKeypad"
import { Sheet } from "./Sheet"
import { Text as AppText } from "./Text"

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** What is being counted, for the a11y label + keypad title ("tablet", "strip"). */
  unitLabel?: string
  /** Called when + is pressed at max (e.g. to ask the server for more allowance). */
  onLimit?: () => void
  disabled?: boolean
}

// 48dp − value + stepper. Tapping the value opens a keypad sheet to type an
// exact quantity (clamped to min..max by the caller's onChange).
export function QuantityStepper({ value, onChange, min = 1, max = Infinity, unitLabel = "item", onLimit, disabled }: QuantityStepperProps) {
  const theme = useTheme()
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState("")

  function step(delta: number) {
    const next = value + delta
    if (delta > 0 && next > max) {
      haptics.error()
      onLimit?.()
      return
    }
    if (next < min) return
    haptics.tick()
    onChange(next)
  }

  function confirmDraft() {
    const n = keypadNumber(draft)
    setTyping(false)
    if (n >= min) onChange(n)
  }

  return (
    <View style={styles.row}>
      <IconButton
        icon="remove"
        variant="tonal"
        accessibilityLabel={`Decrease ${unitLabel} quantity`}
        onPress={() => step(-1)}
        disabled={disabled || value <= min}
      />
      <Pressable
        onPress={() => {
          setDraft("")
          setTyping(true)
        }}
        disabled={disabled}
        accessibilityRole="adjustable"
        accessibilityLabel={`Quantity ${value} ${unitLabel}${value === 1 ? "" : "s"}`}
        accessibilityHint="Tap to type a quantity"
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        style={[styles.value, { borderColor: theme.border, backgroundColor: theme.surface }]}
      >
        <Text style={[styles.valueText, { color: theme.text }]}>{value}</Text>
      </Pressable>
      <IconButton
        icon="add"
        variant="tonal"
        accessibilityLabel={`Increase ${unitLabel} quantity`}
        onPress={() => step(1)}
        disabled={disabled}
      />
      <Sheet open={typing} onClose={() => setTyping(false)} title={`Quantity (${unitLabel}s)`}>
        <AppText variant="display" align="center" tabular>
          {draft === "" ? value : draft}
        </AppText>
        {Number.isFinite(max) ? (
          <AppText variant="caption" tone="secondary" align="center">
            Up to {max}
          </AppText>
        ) : null}
        <NumericKeypad value={draft} onChange={setDraft} maxLength={5} hideDoubleZero />
        <Button title="Set quantity" size="lg" onPress={confirmDraft} disabled={draft === "" || keypadNumber(draft) < min} />
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  value: {
    minWidth: TOUCH_TARGET + 8,
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  valueText: { fontSize: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
})
