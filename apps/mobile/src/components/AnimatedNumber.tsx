import { useEffect, useRef, useState } from "react"
import type { StyleProp, TextStyle } from "react-native"
import Animated, { type AnimatedStyle } from "react-native-reanimated"
import { useMotion } from "../lib/motion"
import { rollFrame, shouldRoll } from "../lib/numberRoll"
import { useTheme } from "../theme/useTheme"
import { motion, typography, type TypeVariant } from "../theme/tokens"
import { toneColor, type TextTone } from "./Text"

interface AnimatedNumberProps {
  value: number
  /** Turns the (integer) value into text, e.g. formatKES for cents. */
  format: (n: number) => string
  variant?: TypeVariant
  tone?: TextTone
  align?: "left" | "center" | "right"
  /** Off for figures being typed on a keypad (they must track every key). */
  animate?: boolean
  /** Roll up from 0 on first show (the "Give change" count-up). */
  fromZero?: boolean
  /** Start the first roll after this delay (lets a hero sequence play). */
  delay?: number
  duration?: number
  style?: StyleProp<TextStyle>
  /** Extra UI-thread style (e.g. an interpolated colour). */
  animatedStyle?: AnimatedStyle<TextStyle>
  accessibilityLabel?: string
}

// A money/quantity figure that rolls to its new value (~250 ms, ease-out) and
// always ends on the exact value. Tabular figures so digits don't jitter.
// Only this <Text> re-renders during a roll (one small JS-driven loop — text
// content can't be animated on the UI thread without a TextInput hack), and
// TalkBack only ever hears the final value. Rapid changes (typing, quick
// repeated taps) snap. To keep the JS thread free for taps during a roll it
// renders at most every ROLL_STEP_MS (~30 fps — still reads as a smooth roll)
// and skips frames whose text wouldn't change.
const ROLL_STEP_MS = 32

export function AnimatedNumber({
  value, format, variant = "bodyStrong", tone = "default", align, animate = true, fromZero, delay = 0, duration = motion.duration.number,
  style, animatedStyle, accessibilityLabel,
}: AnimatedNumberProps) {
  const theme = useTheme()
  const { reduced } = useMotion()
  const [shown, setShown] = useState(() => (fromZero && animate && !reduced ? 0 : value))
  const shownRef = useRef(shown)
  const prevRef = useRef<number | null>(fromZero ? 0 : null)
  const lastChangeAt = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    const now = Date.now()
    const roll = shouldRoll({ enabled: animate, reduced, from, to: value, lastChangeAt: lastChangeAt.current, now })
    prevRef.current = value
    lastChangeAt.current = now
    const set = (n: number) => {
      shownRef.current = n
      setShown(n)
    }
    if (!roll) {
      set(value)
      return
    }
    const start = shownRef.current
    let raf = 0
    let t0 = 0
    let lastStep = 0
    const timer = setTimeout(() => {
      const tick = (ts: number) => {
        if (!t0) t0 = ts
        const t = (ts - t0) / duration
        if (t >= 1) {
          set(value)
          return
        }
        if (ts - lastStep >= ROLL_STEP_MS) {
          lastStep = ts
          const n = rollFrame(start, value, t)
          if (format(n) !== format(shownRef.current)) set(n)
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      // Interrupted: land on the target so nothing is ever left mid-roll.
      set(value)
    }
    // delay/duration are read at roll start only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate, reduced])

  return (
    <Animated.Text
      accessibilityLabel={accessibilityLabel ?? format(value)}
      style={[
        typography[variant],
        { color: toneColor(tone, theme), fontVariant: ["tabular-nums"] },
        align ? { textAlign: align } : null,
        style,
        animatedStyle,
      ]}
    >
      {format(shown)}
    </Animated.Text>
  )
}
