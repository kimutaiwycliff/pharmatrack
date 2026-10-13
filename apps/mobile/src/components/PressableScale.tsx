import { forwardRef, useRef, useState } from "react"
import { StyleSheet, type StyleProp, type View, type ViewStyle } from "react-native"
import { Pressable, type PressableProps, type PressableStateCallbackType } from "react-native-gesture-handler"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { haptics } from "../lib/haptics"
import { useMotion } from "../lib/motion"
import { motion } from "../theme/tokens"

type PressableEvent = Parameters<NonNullable<PressableProps["onPress"]>>[0]

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export type PressHaptic = keyof typeof haptics

export interface PressableScaleProps extends Omit<PressableProps, "style" | "onPress"> {
  /**
   * Press handler. If it returns a promise, further presses are ignored until
   * it settles — a slow save can't be submitted twice.
   */
  onPress?: (() => unknown) | null
  /**
   * Ignore a repeat press within this many ms (default 0 = off). Buttons and
   * navigation rows set it so a double tap can't submit or open a screen twice;
   * keypads and steppers leave it off so fast tapping still works.
   */
  pressGuardMs?: number
  /** Static style, or a function of the pressed state (for a pressed background). */
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>)
  /** Scale while held (default 0.97; full-width rows use motion.rowPressScale). */
  scaleTo?: number
  /** Haptic fired on press (after the gesture is recognised, never on scroll). */
  haptic?: PressHaptic
}

// The app's one press primitive: shrinks slightly on the UI thread while held
// (opacity dim instead under reduced motion), springs back on release, and
// can fire a haptic. The press itself is never delayed by the animation.
// android_ripple is off — the scale is the feedback.
//
// Built on gesture-handler's Pressable, not React Native's: on Android (new
// architecture) RN's Pressable measures itself against a stale, unscrolled
// position after a list scrolls or a row animates, so a normal tap fires
// onPressIn but drops onPress — the "tap two or three times" bug
// (software-mansion/react-native-reanimated#6935, facebook/react-native#49694).
// Gesture-handler hit-tests natively against the real on-screen view.
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { style, scaleTo = motion.pressScale, haptic, onPressIn, onPressOut, onPress, pressGuardMs = 0, disabled, ...rest },
  ref,
) {
  const m = useMotion()
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)
  const styleIsFn = typeof style === "function"
  // Only tracked when the caller styles by pressed state (Pressable does the same internally).
  const [pressed, setPressed] = useState(false)

  const resolved = styleIsFn ? style({ pressed }) : style
  // The caller's own opacity (e.g. a disabled look) is kept and multiplied, not overridden.
  const baseOpacity = (StyleSheet.flatten(resolved)?.opacity as number | undefined) ?? 1
  const animated = useAnimatedStyle(() => ({ opacity: baseOpacity * opacity.value, transform: [{ scale: scale.value }] }))

  function handlePressIn(e: PressableEvent) {
    const target = m.press(scaleTo)
    scale.value = m.timing(target.scale, "fast")
    opacity.value = m.timing(target.opacity, "fast")
    if (styleIsFn) setPressed(true)
    onPressIn?.(e)
  }

  function handlePressOut(e: PressableEvent) {
    scale.value = m.spring(1, "snappy")
    opacity.value = m.timing(1, "fast")
    if (styleIsFn) setPressed(false)
    onPressOut?.(e)
  }

  // Refs, not state: a second tap can arrive before React re-renders.
  const lastPressAt = useRef(0)
  const running = useRef(false)
  function handlePress() {
    if (!onPress || running.current) return
    const now = Date.now()
    if (pressGuardMs > 0 && now - lastPressAt.current < pressGuardMs) return
    lastPressAt.current = now
    if (haptic) haptics[haptic]()
    const result = onPress()
    if (result instanceof Promise) {
      running.current = true
      result.then(
        () => {
          running.current = false
        },
        () => {
          running.current = false
        },
      )
    }
  }

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress ? handlePress : undefined}
      android_ripple={null}
      style={[resolved, animated]}
    />
  )
})
