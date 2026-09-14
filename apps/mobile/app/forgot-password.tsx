import { useState } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { authClient } from "../src/lib/auth-client"
import { env } from "../src/lib/env"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Screen, ScreenHeader } from "../src/components"

// Mirrors apps/web/app/(auth)/auth/reset/page.tsx: same authClient.requestPasswordReset
// call. redirectTo points at the WEB app's /auth/set-password (there's no
// mobile equivalent, and there doesn't need to be — the emailed link opens in
// the phone's browser, the user sets a new password there, then returns here
// to sign back in). This screen only triggers the email; it never completes
// a reset itself.
export default function ForgotPassword() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!email.trim()) { setError("Enter your email address"); return }
    setSending(true)
    setError(null)
    try {
      const { error: reqError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${env.EXPO_PUBLIC_API_URL}/auth/set-password`,
      })
      if (reqError) throw new Error(reqError.message)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email")
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen style={styles.container}>
      <ScreenHeader title="Reset password" />
      {sent ? (
        <View style={styles.sentBox}>
          <Ionicons name="mail-outline" size={40} color={theme.green} />
          <Text style={styles.sentTitle}>Check your email</Text>
          <Text style={styles.sentText}>
            If an account exists for {email.trim()}, we&apos;ve sent a link to reset your password. Open it on
            this phone to set a new password, then come back here to sign in.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.subtitle}>Enter your account email and we&apos;ll send you a reset link.</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Send reset link" onPress={submit} loading={sending} />
        </>
      )}
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { gap: 12 },
    subtitle: { fontSize: 14, color: theme.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    error: { color: theme.red, fontSize: 13 },
    sentBox: { alignItems: "center", gap: 10, paddingVertical: 24 },
    sentTitle: { fontSize: 17, fontWeight: "700", color: theme.text },
    sentText: { fontSize: 14, color: theme.textSecondary, textAlign: "center", lineHeight: 20 },
  })
}
