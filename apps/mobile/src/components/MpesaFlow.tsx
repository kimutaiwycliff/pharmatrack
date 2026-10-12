import { useEffect, useMemo, useState } from "react"
import { StyleSheet, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated"
import { formatKES, fromCents, type Cents } from "@pharmatrack/core"
import { sendStkPush } from "../lib/mpesa"
import { useMotion } from "../lib/motion"
import { useTheme } from "../theme/useTheme"
import { radius, space, type Theme } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"
import { Text } from "./Text"
import { TextField } from "./TextField"

const CODE_RE = /^[A-Z0-9]{10}$/i
const WAIT_SECONDS = 60

type Phase = "phone" | "waiting" | "manual"

interface MpesaFlowProps {
  // Decimal-KES amount to request via STK push, expressed as integer cents
  // (ADR-008) — the full sale total for a pure M-Pesa sale, or just the
  // M-Pesa portion for a Split sale. Converted to decimal only at the API
  // boundary (POST /api/mpesa), never floated in between.
  amountCents: Cents
  onConfirmed: (mpesaReference: string | null) => void
  /** Rendered inside a <Sheet> (the POS payment sheet) — keeps inputs above the keyboard. */
  inSheet?: boolean
}

// Reusable STK-push + manual-confirm flow shared by the pure "M-Pesa" payment
// method and the M-Pesa portion of "Split" — mirrors
// apps/web/components/pos/MpesaModal.tsx's real behavior:
//
//  - "waiting" is a client-side-only 60s countdown (a UI-thread ring + a
//    tiny once-a-second label; nothing else re-renders). Nothing
//    server-side ever confirms the STK push — there is no status-polling
//    endpoint — so the cashier must eventually attest completion themselves
//    ("Confirm received") or key in the M-Pesa code by hand ("Enter code
//    manually"). This is intentional, matching real-world till behavior, not
//    a shortcut.
//  - "Resend" re-fires the same POST /api/mpesa call with the same phone/amount.
//  - The M-Pesa code is always optional; a non-empty value must match
//    /^[A-Z0-9]{10}$/i or the confirm action is blocked (verified directly
//    against apps/web/components/pos/MpesaModal.tsx's `disabled={codeBlocks}`).
export function MpesaFlow({ amountCents, onConfirmed, inSheet }: MpesaFlowProps) {
  const theme = useTheme()
  const m = useMotion()
  const styles = useMemo(() => createStyles(theme), [theme])

  const [phase, setPhase] = useState<Phase>("phone")
  const [returnPhase, setReturnPhase] = useState<"phone" | "waiting">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  // Bumped on every (re)send so the countdown restarts.
  const [sentAt, setSentAt] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = Number(fromCents(amountCents))
  const trimmedCode = code.trim()
  const codeValid = CODE_RE.test(trimmedCode)
  const codeBlocks = trimmedCode.length > 0 && !codeValid

  async function send() {
    setError(null)
    setSending(true)
    const result = await sendStkPush(phone, amount)
    setSending(false)
    if (!result.ok) {
      setError(result.error ?? "Could not send the M-Pesa prompt. Check the number and try again.")
      return
    }
    setSentAt(Date.now())
    setPhase("waiting")
  }

  function enterManual(from: "phone" | "waiting") {
    setReturnPhase(from)
    setError(null)
    setPhase("manual")
  }

  return (
    <Card style={styles.card}>
      <View style={styles.amountRow}>
        <Text variant="label" tone="secondary">
          M-Pesa amount
        </Text>
        <Text variant="headline" tabular>
          {formatKES(amountCents)}
        </Text>
      </View>

      {/* Phases fade into each other. */}
      {phase === "phone" ? (
        <Animated.View key="phone" entering={m.fadeIn} exiting={m.fadeOut} style={styles.phase}>
          <TextField
            label="Customer phone"
            inSheet={inSheet}
            placeholder="e.g. 07XXXXXXXX"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            error={error}
          />
          <Button
            title={sending ? "Sending…" : "Send STK push"}
            onPress={send}
            loading={sending}
            disabled={phone.replace(/\D/g, "").length < 9}
            icon={<Ionicons name="call-outline" size={18} color={theme.onAccent} />}
          />
          <Button
            title="Enter code manually instead"
            variant="secondary"
            onPress={() => enterManual("phone")}
            icon={<Ionicons name="create-outline" size={18} color={theme.text} />}
          />
        </Animated.View>
      ) : null}

      {phase === "waiting" ? (
        <Animated.View key="waiting" entering={m.fadeIn} exiting={m.fadeOut} style={styles.waitingBox}>
          <WaitingIndicator key={`ring-${sentAt}`} seconds={WAIT_SECONDS} />
          <Text variant="bodyStrong" align="center">
            Request sent to {phone}
          </Text>
          <Text variant="label" tone="secondary" align="center" style={styles.regular}>
            Ask the customer to enter their M-Pesa PIN
          </Text>
          <CountdownLabel key={`label-${sentAt}`} seconds={WAIT_SECONDS} />
          <View style={styles.waitingActions}>
            <Button
              title="Resend"
              variant="secondary"
              onPress={send}
              loading={sending}
              icon={<Ionicons name="refresh-outline" size={16} color={theme.text} />}
            />
            <Button title="Enter code manually" variant="secondary" onPress={() => enterManual("waiting")} />
            <Button
              title="Confirm received"
              onPress={() => onConfirmed(null)}
              icon={<Ionicons name="checkmark-circle-outline" size={18} color={theme.onAccent} />}
            />
          </View>
          {error ? (
            <Text variant="label" tone="danger" style={styles.regular}>
              {error}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      {phase === "manual" ? (
        <Animated.View key="manual" entering={m.fadeIn} exiting={m.fadeOut} style={styles.phase}>
          <Text variant="caption" tone="secondary">
            Use this when the customer paid via Pay Bill or Send Money on their own. The code is
            optional — confirm once you have seen the payment.
          </Text>
          <TextField
            label="M-Pesa code (optional)"
            inSheet={inSheet}
            placeholder="e.g. QK12ABC3DE"
            autoCapitalize="characters"
            maxLength={10}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase().slice(0, 10))}
            error={codeBlocks ? "Must be 10 characters — or leave it blank" : null}
          />
          <Button
            title={trimmedCode ? "Confirm payment" : "Confirm — customer paid"}
            onPress={() => onConfirmed(trimmedCode || null)}
            disabled={codeBlocks}
            icon={<Ionicons name="checkmark-circle-outline" size={18} color={theme.onAccent} />}
          />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => setPhase(returnPhase)}
            icon={<Ionicons name="arrow-back-outline" size={18} color={theme.text} />}
          />
        </Animated.View>
      ) : null}
    </Card>
  )
}

const RING = 76
const STROKE = 5

/**
 * Pulsing phone inside a countdown ring. The ring is two half-arcs rotated by
 * one shared value running 1 → 0 over the wait (pure transforms, no SVG, no
 * per-second React renders). It conveys time left, so it runs even under
 * reduced motion; the decorative pulse does not.
 */
function WaitingIndicator({ seconds }: { seconds: number }) {
  const theme = useTheme()
  const m = useMotion()
  const left = useSharedValue(1)
  const pulse = useSharedValue(1)

  useEffect(() => {
    left.value = 1
    left.value = withTiming(0, { duration: seconds * 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never })
    return () => cancelAnimation(left)
  }, [seconds, left])

  useEffect(() => {
    if (m.reduced) {
      pulse.value = 1
      return
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 600, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.Never }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.Never }),
      ),
      -1,
    )
    return () => cancelAnimation(pulse)
  }, [m.reduced, pulse])

  // Arc covering [a−180°, a] (clockwise from 12 o'clock); each half clips it.
  const rightHalf = useAnimatedStyle(() => {
    const a = Math.min(left.value * 360, 180)
    return { transform: [{ rotate: `${45 - 180 + a}deg` }] }
  })
  const leftHalf = useAnimatedStyle(() => {
    const a = Math.max(left.value * 360, 180)
    return { transform: [{ rotate: `${45 - 180 + a}deg` }] }
  })
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

  const arc = { borderColor: "transparent", borderTopColor: theme.green, borderRightColor: theme.green }
  return (
    <View style={ringStyles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[ringStyles.track, { borderColor: theme.green100 }]} />
      <View style={[ringStyles.half, ringStyles.halfRight]}>
        <Animated.View style={[ringStyles.arc, ringStyles.arcInRight, arc, rightHalf]} />
      </View>
      <View style={[ringStyles.half, ringStyles.halfLeft]}>
        <Animated.View style={[ringStyles.arc, ringStyles.arcInLeft, arc, leftHalf]} />
      </View>
      <Animated.View style={[ringStyles.icon, { backgroundColor: theme.surface }, iconStyle]}>
        <Ionicons name="phone-portrait-outline" size={28} color={theme.green600} />
      </Animated.View>
    </View>
  )
}

/** "Waiting · 0:42 remaining" — the only thing that re-renders each second. */
function CountdownLabel({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds)
  // Cosmetic countdown only — reaching 0 does nothing (no auto-fail,
  // nothing is blocked), same as the web modal.
  useEffect(() => {
    const id = setInterval(() => setLeft((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <Text variant="label" tone="success" tabular>
      Waiting · 0:{String(left).padStart(2, "0")} remaining
    </Text>
  )
}

const ringStyles = StyleSheet.create({
  wrap: { width: RING, height: RING, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  track: { position: "absolute", width: RING, height: RING, borderRadius: RING / 2, borderWidth: STROKE },
  half: { position: "absolute", top: 0, width: RING / 2, height: RING, overflow: "hidden" },
  halfRight: { left: RING / 2 },
  halfLeft: { left: 0 },
  arc: { position: "absolute", top: 0, width: RING, height: RING, borderRadius: RING / 2, borderWidth: STROKE },
  arcInRight: { left: -RING / 2 },
  arcInLeft: { left: 0 },
  icon: { width: RING - STROKE * 4, height: RING - STROKE * 4, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
})

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: { gap: 10 },
    amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    phase: { gap: 10 },
    waitingBox: {
      backgroundColor: theme.green50,
      borderColor: theme.green100,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      gap: 8,
      alignItems: "center",
    },
    waitingActions: { gap: 8, width: "100%" },
    regular: { fontWeight: "400" },
  })
}
