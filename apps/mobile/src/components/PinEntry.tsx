import { useEffect, useRef, useState } from "react"
import { StyleSheet } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated"
import { useMotion } from "../lib/motion"
import { useTheme } from "../theme/useTheme"
import { motion, space } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"
import { useShake } from "./Motion"
import { NumericKeypad } from "./NumericKeypad"
import { Text } from "./Text"

interface PinEntryProps {
  title: string
  subtitle?: string
  submitLabel?: string
  // Resolves to an error message, or null on success.
  onSubmit: (pin: string) => Promise<string | null>
  onCancel?: () => void
}

const MIN_PIN = 4
const MAX_PIN = 8

// PIN prompt shared by offline staff switching and the manager override.
// A dot row + the app's big keypad (no system keyboard, leading zeros kept).
// Verification/lockout stays with the caller's onSubmit; a wrong PIN shakes
// the dots and clears them. bcrypt takes a second or two in JS, so the button
// shows a spinner while it runs rather than looking frozen.
export function PinEntry({ title, subtitle, submitLabel = "Continue", onSubmit, onCancel }: PinEntryProps) {
  const theme = useTheme()
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { style: shakeStyle, shake } = useShake()

  async function submit() {
    if (pending) return
    if (pin.length < MIN_PIN) {
      setError("Enter the 4-digit PIN")
      shake()
      return
    }
    setError(null)
    setPending(true)
    try {
      const err = await onSubmit(pin)
      if (err) {
        setError(err)
        setPin("")
        shake()
      }
    } finally {
      setPending(false)
    }
  }

  const dots = Math.max(MIN_PIN, pin.length)
  return (
    <Card style={styles.card}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      <Animated.View
        style={[styles.dots, shakeStyle]}
        accessible
        accessibilityLabel={`PIN, ${pin.length} digit${pin.length === 1 ? "" : "s"} entered`}
        accessibilityLiveRegion="polite"
      >
        {Array.from({ length: dots }, (_, i) => (
          <PinDot key={i} filled={i < pin.length} />
        ))}
      </Animated.View>
      {error ? (
        <Text tone="danger" align="center" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <NumericKeypad
        value={pin}
        mode="pin"
        maxLength={MAX_PIN}
        onChange={(v) => {
          setPin(v)
          if (error) setError(null)
        }}
      />
      <Button
        title={pending ? "Checking…" : submitLabel}
        onPress={submit}
        loading={pending}
        disabled={pin.length < MIN_PIN && !pending}
        leadingIcon={<Ionicons name="lock-open-outline" size={18} color={theme.onAccent} />}
      />
      {onCancel ? <Button title="Back" variant="secondary" onPress={onCancel} disabled={pending} /> : null}
    </Card>
  )
}

/** One PIN dot: fills with a small critically-damped pop. */
function PinDot({ filled }: { filled: boolean }) {
  const theme = useTheme()
  const m = useMotion()
  const scale = useSharedValue(1)
  const was = useRef(filled)
  useEffect(() => {
    if (filled && !was.current && !m.reduced) {
      scale.value = withSequence(withTiming(1.25, { duration: motion.duration.fast / 2 }), withSpring(1, { ...motion.spring.snappy }))
    }
    was.current = filled
  }, [filled, m.reduced, scale])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <Animated.View
      style={[
        styles.dot,
        { borderColor: filled ? theme.green600 : theme.borderStrong, backgroundColor: filled ? theme.green600 : "transparent" },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  dots: { flexDirection: "row", justifyContent: "center", gap: space.md, paddingVertical: space.sm },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
})
