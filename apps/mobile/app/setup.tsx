import { useRef, useState } from "react"
import { StyleSheet, View, type TextInput } from "react-native"
import { router } from "expo-router"
import { createLocalBranch, createLocalStaff } from "../src/lib/local-auth"
import { kvSet } from "../src/lib/kv"
import { space } from "../src/theme/tokens"
import { Button, FormScroll, Screen, Text, TextField } from "../src/components"

// ADR-014 — Offline Edition first-run setup. Shown by app/index.tsx only
// when isFirstRun() (no `staff` row exists yet) — replaces the online app's
// server-side /setup + operator-provisioning flow entirely: this creates the
// pharmacy's one branch and its owner account directly in local SQLite, with
// zero network calls, ever.
export default function Setup() {
  const ownerRef = useRef<TextInput>(null)
  const phoneRef = useRef<TextInput>(null)
  const pinRef = useRef<TextInput>(null)
  const confirmRef = useRef<TextInput>(null)
  const [pharmacyName, setPharmacyName] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit() {
    // Return key on the last field can fire while a submit is in flight.
    if (pending) return
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
    <Screen>
      <FormScroll contentStyle={styles.content}>
        <View style={styles.brand}>
          <Text variant="title" align="center" accessibilityRole="header">
            Welcome to PharmaTrack
          </Text>
          <Text tone="secondary" align="center">
            Set up this device once — everything below stays on this phone.
          </Text>
        </View>

        <TextField
          label="Pharmacy / branch name"
          placeholder="e.g. Afya Chemist, Kitengela"
          autoCapitalize="words"
          value={pharmacyName}
          onChangeText={setPharmacyName}
          returnKeyType="next"
          onSubmitEditing={() => ownerRef.current?.focus()}
        />
        <TextField
          ref={ownerRef}
          label="Your full name (owner)"
          autoCapitalize="words"
          autoComplete="name"
          value={ownerName}
          onChangeText={setOwnerName}
          returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()}
        />
        <TextField
          ref={phoneRef}
          label="Your phone number"
          placeholder="07XX XXX XXX"
          helper="You'll sign in with this number and your PIN."
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
          returnKeyType="next"
          onSubmitEditing={() => pinRef.current?.focus()}
        />
        <TextField
          ref={pinRef}
          label="Choose a PIN"
          placeholder="4–8 digits"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          value={pin}
          onChangeText={setPin}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <TextField
          ref={confirmRef}
          label="Confirm PIN"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          value={confirmPin}
          onChangeText={setConfirmPin}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />

        {error ? (
          <Text tone="danger" align="center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button title="Finish setup" size="lg" onPress={onSubmit} loading={pending} style={styles.submitButton} />
      </FormScroll>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: space.sm, paddingVertical: space.xl, gap: space.md },
  brand: { gap: space.sm, marginBottom: space.md },
  submitButton: { marginTop: space.sm },
})
