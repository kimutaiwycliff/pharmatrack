import { useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { signInEmail, signInPin } from "../src/lib/auth-client"
import { cacheDeviceUserAfterPinLogin, tryOfflinePinLogin } from "../src/lib/device-users"
import { verifyLocalPin } from "../src/lib/local-auth"
import { env } from "../src/lib/env"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Screen } from "../src/components"

type Mode = "email" | "pin"

export default function Login() {
  const theme = useTheme()
  const styles = createStyles(theme)
  // ADR-014: the Offline Edition build only ever shows the PIN tab — there
  // is no server for email/password sign-in to reach at all.
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
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const result = await verifyLocalPin(phone, pin)
        if (!result.ok) {
          setError(result.error)
          return
        }
      } else if (mode === "email") {
        const { error: signInError } = await signInEmail(email, password)
        if (signInError) {
          setError(signInError.message ?? "Invalid email or password")
          return
        }
      } else {
        // A reachable server's own answer is authoritative — a definite
        // "wrong PIN" (or similar) 401 here must never be second-guessed by
        // falling back to the offline cache below. Only a genuine network
        // failure (authClient.$fetch throwing, since catchAllError isn't set)
        // reaches the catch block and attempts the offline PIN check.
        try {
          const { error: pinError } = await signInPin(phone, pin)
          if (pinError) {
            setError((pinError as { message?: string }).message ?? "Invalid phone or PIN")
            return
          }
          await cacheDeviceUserAfterPinLogin(phone, pin)
        } catch {
          const offline = await tryOfflinePinLogin(phone, pin)
          if (!offline.ok) {
            setError(offline.error)
            return
          }
        }
      }
      router.replace("/pos")
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>PharmaTrack</Text>

      {env.EXPO_PUBLIC_OFFLINE_MODE ? null : (
        <View style={styles.tabs}>
          <Pressable onPress={() => setMode("pin")} style={[styles.tab, mode === "pin" && styles.tabActive]}>
            <Ionicons name="keypad-outline" size={16} color={mode === "pin" ? "#fff" : theme.textSecondary} />
            <Text style={mode === "pin" ? styles.tabTextActive : styles.tabText}>Till PIN</Text>
          </Pressable>
          <Pressable onPress={() => setMode("email")} style={[styles.tab, mode === "email" && styles.tabActive]}>
            <Ionicons name="mail-outline" size={16} color={mode === "email" ? "#fff" : theme.textSecondary} />
            <Text style={mode === "email" ? styles.tabTextActive : styles.tabText}>Email</Text>
          </Pressable>
        </View>
      )}

      {env.EXPO_PUBLIC_OFFLINE_MODE || mode === "pin" ? (
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
          <Pressable onPress={() => router.push("/forgot-password")} hitSlop={8}>
            <Text style={styles.forgotLink}>Forgot password?</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Sign in" onPress={onSubmit} loading={pending} style={styles.submitButton} />
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { justifyContent: "center", padding: 24, gap: 12 },
    title: { fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 24, color: theme.text },
    forgotLink: { fontSize: 13, fontWeight: "600", color: theme.green, textAlign: "right" },
    tabs: {
      flexDirection: "row",
      marginBottom: 12,
      borderRadius: 8,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.border,
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      backgroundColor: theme.muted,
    },
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
    submitButton: { marginTop: 8 },
    error: { color: theme.red, textAlign: "center" },
  })
}
