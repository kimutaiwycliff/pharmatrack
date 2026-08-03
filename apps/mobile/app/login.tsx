import { useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import { signInEmail, signInPin } from "../src/lib/auth-client"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"

type Mode = "email" | "pin"

export default function Login() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const [mode, setMode] = useState<Mode>("pin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit() {
    setError(null)
    setPending(true)
    try {
      if (mode === "email") {
        const { error: signInError } = await signInEmail(email, password)
        if (signInError) {
          setError(signInError.message ?? "Invalid email or password")
          return
        }
      } else {
        const { error: pinError } = await signInPin(phone, pin)
        if (pinError) {
          setError((pinError as { message?: string }).message ?? "Invalid phone or PIN")
          return
        }
      }
      router.replace("/pos")
    } finally {
      setPending(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PharmaTrack</Text>

      <View style={styles.tabs}>
        <Pressable onPress={() => setMode("pin")} style={[styles.tab, mode === "pin" && styles.tabActive]}>
          <Text style={mode === "pin" ? styles.tabTextActive : styles.tabText}>Till PIN</Text>
        </Pressable>
        <Pressable onPress={() => setMode("email")} style={[styles.tab, mode === "email" && styles.tabActive]}>
          <Text style={mode === "email" ? styles.tabTextActive : styles.tabText}>Email</Text>
        </Pressable>
      </View>

      {mode === "pin" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={theme.textTertiary}
            keyboardType="phone-pad"
            autoCapitalize="none"
            value={phone}
            onChangeText={setPhone}
          />
          <TextInput
            style={styles.input}
            placeholder="4-digit PIN"
            placeholderTextColor={theme.textTertiary}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            value={pin}
            onChangeText={setPin}
          />
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={theme.textTertiary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={onSubmit} disabled={pending}>
        {pending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </View>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: theme.bg },
    title: { fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 24, color: theme.text },
    tabs: {
      flexDirection: "row",
      marginBottom: 12,
      borderRadius: 8,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.border,
    },
    tab: { flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: theme.muted },
    tabActive: { backgroundColor: theme.greenCta },
    tabText: { color: theme.textSecondary },
    tabTextActive: { color: "#fff" },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    button: { backgroundColor: theme.greenCta, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
    buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
    error: { color: theme.red, textAlign: "center" },
  })
}
