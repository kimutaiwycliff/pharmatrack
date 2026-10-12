import { useState } from "react"
import { StyleSheet, Text, TextInput } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"

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
  const styles = createStyles(theme)
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
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
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))}
        keyboardType="number-pad"
        secureTextEntry
        autoFocus
        maxLength={8}
        placeholder="PIN"
        placeholderTextColor={theme.textTertiary}
        onSubmitEditing={submit}
        accessibilityLabel="PIN"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title={pending ? "Checking…" : submitLabel}
        onPress={submit}
        loading={pending}
        icon={<Ionicons name="lock-open-outline" size={18} color="#fff" />}
      />
      {onCancel ? <Button title="Back" variant="secondary" onPress={onCancel} disabled={pending} /> : null}
    </Card>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: { gap: 10 },
    title: { fontSize: 17, fontWeight: "700", color: theme.text },
    subtitle: { fontSize: 14, color: theme.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      minHeight: 56,
      paddingHorizontal: 14,
      fontSize: 24,
      letterSpacing: 8,
      textAlign: "center",
      backgroundColor: theme.surface,
      color: theme.text,
    },
    error: { color: theme.red, textAlign: "center" },
  })
}
