import { useEffect, useRef, useState } from "react"
import { StyleSheet, View, type TextInput } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import Animated, { Keyframe } from "react-native-reanimated"
import { EASE, useMotion } from "../src/lib/motion"
import { authClient, isCaptchaFailure, signInEmail, signInGoogle, signInPin, signOut } from "../src/lib/auth-client"
import { cacheDeviceUserAfterPinLogin, tryOfflinePinLogin } from "../src/lib/device-users"
import { verifyLocalPin } from "../src/lib/local-auth"
import { env } from "../src/lib/env"
import { ApiError, apiJson, errorMessage } from "../src/lib/api"
import { signInErrorMessage, type AuthFailure } from "../src/lib/auth-errors"
import { isNetworkProblem } from "../src/lib/errors"
import { findRosterByPhone, rosterToStaff, verifyRosterPin } from "../src/lib/sync/roster"
import { adoptSignedInUser, switchStaff } from "../src/lib/sync/staff-session"
import { useSyncStore } from "../src/store/sync"
import { useTheme } from "../src/theme/useTheme"
import { radius, space } from "../src/theme/tokens"
import { Button, Chip, FormScroll, Screen, Text, TextField, useShake } from "../src/components"
import { CaptchaSheet } from "../src/components/CaptchaSheet"
import { deviceRequestFrom, useDeviceApprovalStore, type DeviceRequestInfo } from "../src/store/deviceApproval"
import { toast } from "../src/lib/toast"

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
  const [googlePending, setGooglePending] = useState(false)

  // Email sign-in's security check (Cloudflare Turnstile, shown from the
  // website in a sheet). Asked for only once the server says it's needed —
  // then up front for later attempts. undefined = the person closed it.
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [captchaKey, setCaptchaKey] = useState(0)
  const captchaResolve = useRef<((token: string | null | undefined) => void) | null>(null)
  const captchaRequired = useRef(false)
  const askCaptcha = () =>
    new Promise<string | null | undefined>((resolve) => {
      captchaResolve.current = resolve
      setCaptchaKey((k) => k + 1)
      setCaptchaOpen(true)
    })
  const finishCaptcha = (token: string | null | undefined) => {
    setCaptchaOpen(false)
    const resolve = captchaResolve.current
    captchaResolve.current = null
    resolve?.(token)
  }

  // A failed sign-in shakes the form and buzzes (error haptic) once per error.
  useEffect(() => {
    if (error) shake()
  }, [error, shake])

  // ADR-018: the pharmacy only allows approved devices and this phone isn't
  // one yet — show the approval screen, which calls `retry` once approved.
  function openApproval(request: DeviceRequestInfo, retry: () => Promise<void>) {
    useDeviceApprovalStore.getState().start(request, retry)
    router.push("/device-approval")
  }

  // A ref, not `pending`: two quick taps (or Return + tap) land before the
  // re-render, so a state guard would let both submit.
  const busy = useRef(false)

  async function onSubmit() {
    if (busy.current) return
    busy.current = true
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
        const CHECK_SKIPPED = "Complete the security check to sign in, or use Google or your till PIN."
        let token: string | null | undefined = null
        if (captchaRequired.current) {
          token = await askCaptcha()
          if (token === undefined) {
            setError(CHECK_SKIPPED)
            return
          }
        }
        let { error: signInError } = await signInEmail(email, password, token)
        if (signInError && isCaptchaFailure(signInError)) {
          captchaRequired.current = true
          token = await askCaptcha()
          if (token === undefined) {
            setError(CHECK_SKIPPED)
            return
          }
          ;({ error: signInError } = await signInEmail(email, password, token))
        }
        const emailBlocked = deviceRequestFrom(signInError)
        if (emailBlocked) {
          // Email sign-in needs a fresh security check, so after approval the
          // person signs in again here (the phone now counts as approved).
          openApproval(emailBlocked, async () => {
            router.replace("/login")
            toast.success("Phone approved — sign in to continue.")
          })
          return
        }
        if (signInError) {
          setError(isCaptchaFailure(signInError) ? "The security check didn't go through. Please try again." : signInErrorMessage(signInError, "email"))
          return
        }
        await adoptSignedInUser()
      } else {
        // A reachable server's own answer is authoritative — a definite
        // "wrong PIN" (or similar) 401 here must never be second-guessed by
        // falling back to the offline cache below. Only a genuine network
        // failure (authClient.$fetch throwing, since catchAllError isn't set)
        // attempts the offline PIN check; any other throw is a real error.
        let reached = true
        try {
          const { error: pinError } = await signInPin(phone, pin)
          const pinBlocked = deviceRequestFrom(pinError)
          if (pinBlocked) {
            const [p, n] = [phone, pin]
            openApproval(pinBlocked, async () => {
              const again = await signInPin(p, n)
              if (again.error) {
                toast.error(signInErrorMessage(again.error as AuthFailure, "pin"))
                router.replace("/login")
                return
              }
              await cacheDeviceUserAfterPinLogin(p, n)
              await adoptSignedInUser()
              router.replace("/checking")
            })
            return
          }
          if (pinError) {
            setError(signInErrorMessage(pinError as AuthFailure, "pin"))
            return
          }
        } catch (err) {
          if (!isNetworkProblem(err)) throw err
          reached = false
        }
        if (reached) {
          await cacheDeviceUserAfterPinLogin(phone, pin)
          await adoptSignedInUser()
        } else {
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
    } catch (err) {
      setError(errorMessage(err, "Couldn't sign you in. Check your details and connection, then try again."))
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  // Owners who signed up with Google have no password — this is their way in.
  async function onGoogle() {
    if (busy.current) return
    busy.current = true
    setError(null)
    setGooglePending(true)
    try {
      const { error: googleError } = await signInGoogle()
      if (googleError) {
        setError(signInErrorMessage(googleError, "email"))
        return
      }
      // Closing the Google window leaves no session — nothing to do.
      const user = (await authClient.getSession()).data?.user
      if (!user) return
      try {
        await apiJson("/api/mobile/me")
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          await signOut().catch(() => undefined)
          setError("This Google account isn't linked to a pharmacy yet. Set up your pharmacy at pharmatrack.co.ke, or ask the owner to invite this email.")
          return
        }
        throw err
      }
      await adoptSignedInUser()
      router.replace("/checking")
    } catch (err) {
      setError(errorMessage(err, "Couldn't sign in with Google. Check your connection and try again."))
    } finally {
      busy.current = false
      setGooglePending(false)
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

        <Button title="Sign in" size="lg" onPress={onSubmit} loading={pending} disabled={googlePending} style={styles.submitButton} />

        {offline ? null : (
          <>
            <View style={styles.divider} accessible={false}>
              <View style={[styles.rule, { backgroundColor: theme.border }]} />
              <Text variant="caption" tone="secondary">or</Text>
              <View style={[styles.rule, { backgroundColor: theme.border }]} />
            </View>
            <Button
              title="Continue with Google"
              variant="secondary"
              size="lg"
              onPress={onGoogle}
              loading={googlePending}
              disabled={pending}
              leadingIcon={<Ionicons name="logo-google" size={18} color={theme.text} />}
            />
          </>
        )}
      </FormScroll>
      {offline ? null : (
        <CaptchaSheet key={captchaKey} open={captchaOpen} onResult={finishCaptcha} onClose={() => finishCaptcha(undefined)} />
      )}
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
  divider: { flexDirection: "row", alignItems: "center", gap: space.sm, marginVertical: space.xs },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
})
