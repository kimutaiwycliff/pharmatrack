import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { authClient } from "../src/lib/auth-client"
import { env } from "../src/lib/env"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"
import { Button, FormScroll, Screen, ScreenHeader, Text, TextField } from "../src/components"

// Mirrors apps/web/app/(auth)/auth/reset/page.tsx: same authClient.requestPasswordReset
// call. redirectTo points at the WEB app's /auth/set-password (there's no
// mobile equivalent, and there doesn't need to be — the emailed link opens in
// the phone's browser, the user sets a new password there, then returns here
// to sign back in). This screen only triggers the email; it never completes
// a reset itself.
export default function ForgotPassword() {
  const theme = useTheme()
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
    <Screen>
      <ScreenHeader title="Reset password" />
      <FormScroll>
        {sent ? (
          <View style={styles.sentBox} accessibilityLiveRegion="polite">
            <Ionicons name="mail-outline" size={44} color={theme.green} />
            <Text variant="headline" align="center">
              Check your email
            </Text>
            <Text tone="secondary" align="center">
              If an account exists for {email.trim()}, we&apos;ve sent a link to reset your password. Open it on this phone to
              set a new password, then come back here to sign in.
            </Text>
            <Button title="Back to sign in" variant="secondary" onPress={() => router.back()} style={styles.back} />
          </View>
        ) : (
          <>
            <Text tone="secondary">Enter your account email and we&apos;ll send you a reset link.</Text>
            <TextField
              label="Email"
              placeholder="you@pharmacy.co.ke"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              autoFocus
              value={email}
              onChangeText={(v) => {
                setEmail(v)
                if (error) setError(null)
              }}
              returnKeyType="send"
              onSubmitEditing={submit}
              error={error}
            />
            <Button title="Send reset link" onPress={submit} loading={sending} />
          </>
        )}
      </FormScroll>
    </Screen>
  )
}

const styles = StyleSheet.create({
  sentBox: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  back: { marginTop: space.md, alignSelf: "stretch" },
})
