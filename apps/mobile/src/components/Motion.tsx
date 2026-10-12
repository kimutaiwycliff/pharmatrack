import { useCallback, useEffect, type ReactNode } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated"
import { haptics } from "../lib/haptics"
import { EASE, useMotion } from "../lib/motion"
import { useTheme } from "../theme/useTheme"
import { motion, radius } from "../theme/tokens"

// Small shared motion building blocks (UI-thread transform/opacity only).

/** Content that fades (or fades + rises) in when it mounts; optional stagger delay. */
export function FadeInView({
  children, style, rise, delay = 0, exit,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Rise ~10 px while fading (cards, sections). Plain fade otherwise. */
  rise?: boolean
  delay?: number
  /** Also fade out when unmounted (crossfades between two states). */
  exit?: boolean
}) {
  const m = useMotion()
  const entering = delay > 0 ? m.stagger(0, delay) : rise ? m.riseIn : m.fadeIn
  return (
    <Animated.View entering={entering} exiting={exit ? m.fadeOut : undefined} style={style}>
      {children}
    </Animated.View>
  )
}

/**
 * Error shake (translateX ±6 px × 3, ~250 ms) + optional error haptic.
 * Returns the style to put on an Animated.View and a `shake()` trigger.
 * Under reduced motion only the haptic fires.
 */
export function useShake() {
  const m = useMotion()
  const x = useSharedValue(0)
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const shake = useCallback(
    (withHaptic = true) => {
      if (withHaptic) haptics.error()
      x.set(m.shake())
    },
    [m, x],
  )
  return { style, shake }
}

/**
 * A check mark that draws itself in: short stroke, then the long one (two
 * bars of an L rotated 45°, each growing via scale from its corner — no SVG).
 * `play` false shows nothing; reduced motion shows it instantly.
 */
export function CheckMark({ size = 56, color, thickness, play = true, delay = 0 }: { size?: number; color?: string; thickness?: number; play?: boolean; delay?: number }) {
  const theme = useTheme()
  const { reduced } = useMotion()
  const short = useSharedValue(0)
  const long = useSharedValue(0)
  const t = thickness ?? Math.max(3, Math.round(size * 0.1))
  const legW = Math.round(size * 0.3)
  const legH = Math.round(size * 0.58)
  const SHORT_MS = 110
  const LONG_MS = 170

  useEffect(() => {
    if (!play) {
      short.value = 0
      long.value = 0
      return
    }
    if (reduced) {
      short.value = 1
      long.value = 1
      return
    }
    const opts = { reduceMotion: ReduceMotion.Never, easing: EASE.standard }
    short.value = withDelay(delay, withTiming(1, { ...opts, duration: SHORT_MS }))
    long.value = withDelay(delay + SHORT_MS, withTiming(1, { ...opts, duration: LONG_MS }))
  }, [play, reduced, delay, short, long])

  const shortStyle = useAnimatedStyle(() => ({ opacity: short.value > 0 ? 1 : 0, transform: [{ scaleX: short.value }] }))
  const longStyle = useAnimatedStyle(() => ({ opacity: long.value > 0 ? 1 : 0, transform: [{ scaleY: long.value }] }))
  const c = color ?? theme.green600

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ width: legW, height: legH, transform: [{ translateX: -size * 0.02 }, { translateY: -size * 0.07 }, { rotate: "45deg" }] }}>
        <Animated.View
          style={[{ position: "absolute", left: 0, bottom: 0, width: legW, height: t, borderRadius: t / 2, backgroundColor: c, transformOrigin: "left center" }, shortStyle]}
        />
        <Animated.View
          style={[{ position: "absolute", right: 0, bottom: 0, width: t, height: legH, borderRadius: t / 2, backgroundColor: c, transformOrigin: "center bottom" }, longStyle]}
        />
      </View>
    </View>
  )
}

/** Determinate progress bar (0..1) that glides between values via scaleX. */
export function ProgressBar({ value, color, style, accessibilityLabel }: { value: number; color?: string; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const theme = useTheme()
  const m = useMotion()
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const p = useSharedValue(clamped)
  useEffect(() => {
    p.value = m.timing(clamped, "base")
  }, [clamped, m, p])
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }))
  return (
    <View
      style={[styles.track, { backgroundColor: theme.mutedStrong }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View style={[styles.fill, { backgroundColor: color ?? theme.green }, fill]} />
    </View>
  )
}

/** Opacity flash overlay (fill parent) — e.g. a green "added" flash on a tile. Call `flash()` to play. */
export function useFlash() {
  const { reduced } = useMotion()
  const o = useSharedValue(0)
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  const flash = useCallback(() => {
    o.set(
      withTiming(1, { duration: reduced ? 0 : 60, reduceMotion: ReduceMotion.Never }, () => {
        o.set(withTiming(0, { duration: reduced ? motion.duration.fast : 320, reduceMotion: ReduceMotion.Never }))
      }),
    )
  }, [o, reduced])
  return { style, flash }
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.pill, overflow: "hidden" },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, transformOrigin: "left center" },
})
