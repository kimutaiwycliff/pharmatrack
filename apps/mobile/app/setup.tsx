import { useState } from "react"
import { StyleSheet, Text, TextInput } from "react-native"
import { router } from "expo-router"
import { createLocalBranch, createLocalStaff } from "../src/lib/local-auth"
import { kvSet } from "../src/lib/kv"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Screen } from "../src/components"

// ADR-014 — Offline Edition first-run setup. Shown by app/index.tsx only
// when isFirstRun() (no `staff` row exists yet) — replaces the online app's
// server-side /setup + operator-provisioning flow entirely: this creates the
// pharmacy's one branch and its owner account directly in local SQLite, with
// zero network calls, ever.
export default function Setup() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const [pharmacyName, setPharmacyName] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit() {
    setError(null)
    if (!pharmacyName.trim() || !ownerName.trim() || !phone.trim()) {
      setError("Fill in every field")
      return
    }
    if (!/^\d{4,8}$/.test(pin)) {
      setError("PIN must be 4-8 digits")
      return
    }
    if (pin !== confirmPin) {
      setError("PINs don't match")
      return
    }
    setPending(true)
    try {
      const branch = await createLocalBranch({ name: pharmacyName.trim() })
      const owner = await createLocalStaff({
        fullName: ownerName.trim(),
        phone,
        role: "owner",
        pin,
        branchId: branch.id,
      })
      await kvSet("offline_current_staff_id", owner.id)
      router.replace("/pos")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed")
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>Welcome to PharmaTrack</Text>
      <Text style={styles.subtitle}>Set up this device once — everything below stays on this phone.</Text>

      <TextInput
        style={styles.input}
        placeholder="Pharmacy / branch name"
        placeholderTextColor={theme.textTertiary}
        value={pharmacyName}
        onChangeText={setPharmacyName}
      />
      <TextInput
        style={styles.input}
        placeholder="Your full name (owner)"
        placeholderTextColor={theme.textTertiary}
        value={ownerName}
        onChangeText={setOwnerName}
      />
      <TextInput
        style={styles.input}
        placeholder="Your phone number"
        placeholderTextColor={theme.textTertiary}
        keyboardType="phone-pad"
        autoCapitalize="none"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="Choose a 4-digit PIN"
        placeholderTextColor={theme.textTertiary}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        value={pin}
        onChangeText={setPin}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm PIN"
        placeholderTextColor={theme.textTertiary}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        value={confirmPin}
        onChangeText={setConfirmPin}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Finish setup" onPress={onSubmit} loading={pending} style={styles.submitButton} />
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { justifyContent: "center", padding: 24, gap: 12 },
    title: { fontSize: 26, fontWeight: "700", textAlign: "center", color: theme.text },
    subtitle: { fontSize: 14, textAlign: "center", color: theme.textSecondary, marginBottom: 16 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    submitButton: { marginTop: 8 },
    error: { color: theme.red, textAlign: "center" },
  })
}
