import { useEffect, useRef, useState } from "react"
import { StyleSheet, View, type TextInput } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import Animated, { Keyframe } from "react-native-reanimated"
import { EASE, useMotion } from "../src/lib/motion"
import { signInEmail, signInPin } from "../src/lib/auth-client"
import { cacheDeviceUserAfterPinLogin, tryOfflinePinLogin } from "../src/lib/device-users"
import { verifyLocalPin } from "../src/lib/local-auth"
import { env } from "../src/lib/env"
import { findRosterByPhone, rosterToStaff, verifyRosterPin } from "../src/lib/sync/roster"
import { adoptSignedInUser, switchStaff } from "../src/lib/sync/staff-session"
import { useSyncStore } from "../src/store/sync"
import { useTheme } from "../src/theme/useTheme"
import { radius, space } from "../src/theme/tokens"
import { Button, Chip, FormScroll, Screen, Text, TextField, useShake } from "../src/components"

type Mode = "email" | "pin"

// Logo entrance: a short scale-up + fade (no overshoot). Built once.
const logoIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.8 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE.emphasized },
}).duration(300)

export default function Login() {
  const theme = useTheme()
  const m = useMotion()
  const { style: shakeStyle, shake } = useShake()
  const pinRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  // ADR-014: the Offline Edition build only ever shows the PIN tab — there
  // is no server for email/password sign-in to reach at all.
  const [mode, setMode] = useState<Mode>("pin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // A failed sign-in shakes the form and buzzes (error haptic) once per error.
  useEffect(() => {
    if (error) shake()
  }, [error, shake])

  async function onSubmit() {
    // Return key on the last field can fire while a submit is in flight.
    if (pending) return
    setError(null)
    setPending(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const result = await verifyLocalPin(phone, pin)
        if (!result.ok) {
          setError(result.error)
          return
        }
        router.replace("/pos")
        return
      } else if (mode === "email") {
        const { error: signInError } = await signInEmail(email, password)
        if (signInError) {
          setError(signInError.message ?? "Invalid email or password")
          return
        }
        await adoptSignedInUser()
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
          await adoptSignedInUser()
        } catch {
          // R1: on a registered phone the synced staff roster is the offline
          // credential store (server bcrypt hashes) — no cached cookie needed.
          const member = useSyncStore.getState().device ? findRosterByPhone(phone) : null
          if (member) {
            const r = await verifyRosterPin(member.id, pin)
            if (!r.ok) {
              setError(r.error)
              return
            }
            await switchStaff(rosterToStaff(r.member))
            router.replace("/pos")
            return
          }
          const offline = await tryOfflinePinLogin(phone, pin)
          if (!offline.ok) {
            setError(offline.error)
            return
          }
          await adoptSignedInUser()
        }
      }
      router.replace("/checking")
    } finally {
      setPending(false)
    }
  }

  const offline = env.EXPO_PUBLIC_OFFLINE_MODE
  const pinMode = offline || mode === "pin"

  return (
    <Screen>
      <FormScroll contentStyle={styles.content}>
        <View style={styles.brand}>
          <Animated.View entering={m.reduced ? m.fadeIn : logoIn} style={[styles.logo, { backgroundColor: theme.greenCta }]}>
            <Ionicons name="medkit" size={28} color={theme.onAccent} />
          </Animated.View>
          <Animated.View entering={m.stagger(0, 120)} style={styles.brandText}>
            <Text variant="display" align="center" accessibilityRole="header">
              PharmaTrack
            </Text>
            <Text tone="secondary" align="center">
              {pinMode ? "Sign in with your phone number and till PIN" : "Sign in with your email and password"}
            </Text>
          </Animated.View>
        </View>

        {offline ? null : (
          <View style={styles.tabs} accessibilityRole="tablist">
            <Chip
              label="Till PIN"
              selected={mode === "pin"}
              onPress={() => setMode("pin")}
              icon={<Ionicons name="keypad-outline" size={16} color={mode === "pin" ? theme.green600 : theme.textSecondary} />}
              accessibilityLabel="Sign in with till PIN"
              style={styles.tab}
            />
            <Chip
              label="Email"
              selected={mode === "email"}
              onPress={() => setMode("email")}
              icon={<Ionicons name="mail-outline" size={16} color={mode === "email" ? theme.green600 : theme.textSecondary} />}
              accessibilityLabel="Sign in with email"
              style={styles.tab}
            />
          </View>
        )}

        {/* PIN ↔ Email forms cross-fade; the whole form shakes on a failed sign-in. */}
        <Animated.View style={[styles.form, shakeStyle]}>
        {pinMode ? (
          <Animated.View key="pin" entering={m.fadeIn} exiting={m.fadeOut} style={styles.form}>
            <TextField
              label="Phone number"
              placeholder="07XX XXX XXX"
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={phone}
              onChangeText={setPhone}
              returnKeyType="next"
              onSubmitEditing={() => pinRef.current?.focus()}
            />
            <TextField
              ref={pinRef}
              label="PIN"
              placeholder="4-digit PIN"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              value={pin}
              onChangeText={setPin}
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          </Animated.View>
        ) : (
          <Animated.View key="email" entering={m.fadeIn} exiting={m.fadeOut} style={styles.form}>
            <TextField
              label="Email"
              placeholder="you@pharmacy.co.ke"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <TextField
              ref={passwordRef}
              label="Password"
              placeholder="Password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
            <Button
              title="Forgot password?"
              variant="ghost"
              size="sm"
              onPress={() => router.push("/forgot-password")}
              style={styles.forgot}
            />
          </Animated.View>
        )}

        {error ? (
          <Animated.View entering={m.fadeIn}>
            <Text tone="danger" align="center" accessibilityLiveRegion="polite">
              {error}
            </Text>
          </Animated.View>
        ) : null}
        </Animated.View>

        <Button title="Sign in" size="lg" onPress={onSubmit} loading={pending} style={styles.submitButton} />
      </FormScroll>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: space.sm, paddingVertical: space.xl, gap: space.md },
  brand: { alignItems: "center", gap: space.sm, marginBottom: space.lg },
  brandText: { alignItems: "center", gap: space.sm },
  form: { gap: space.md },
  logo: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", gap: space.sm },
  tab: { flex: 1, justifyContent: "center" },
  forgot: { alignSelf: "flex-end" },
  submitButton: { marginTop: space.sm },
})
