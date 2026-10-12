import { useState } from "react"
import { StyleSheet } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useTheme } from "../theme/useTheme"
import { space } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"
import { Text } from "./Text"
import { TextField } from "./TextField"

interface PinEntryProps {
  title: string
  subtitle?: string
  submitLabel?: string
  // Resolves to an error message, or null on success.
  onSubmit: (pin: string) => Promise<string | null>
  onCancel?: () => void
}

// PIN prompt shared by offline staff switching and the manager override.
// bcrypt verification takes a second or two in JS, so the button shows a
// spinner while it runs rather than looking frozen.
export function PinEntry({ title, subtitle, submitLabel = "Continue", onSubmit, onCancel }: PinEntryProps) {
  const theme = useTheme()
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (pending) return
    if (pin.length < 4) {
      setError("Enter the 4-digit PIN")
      return
    }
    setError(null)
    setPending(true)
    try {
      const err = await onSubmit(pin)
      if (err) {
        setError(err)
        setPin("")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Card style={styles.card}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      <TextField
        label="PIN"
        hideLabel
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))}
        keyboardType="number-pad"
        secureTextEntry
        autoFocus
        maxLength={8}
        placeholder="PIN"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error}
        inputStyle={styles.input}
      />
      <Button
        title={pending ? "Checking…" : submitLabel}
        onPress={submit}
        loading={pending}
        leadingIcon={<Ionicons name="lock-open-outline" size={18} color={theme.onAccent} />}
      />
      {onCancel ? <Button title="Back" variant="secondary" onPress={onCancel} disabled={pending} /> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  input: { minHeight: 56, fontSize: 24, letterSpacing: 8, textAlign: "center" },
})
