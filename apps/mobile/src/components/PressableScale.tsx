import { forwardRef, useState, type ComponentRef } from "react"
import { Pressable, StyleSheet, type GestureResponderEvent, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { haptics } from "../lib/haptics"
import { useMotion } from "../lib/motion"
import { motion } from "../theme/tokens"

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export type PressHaptic = keyof typeof haptics

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
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
export const PressableScale = forwardRef<ComponentRef<typeof Pressable>, PressableScaleProps>(function PressableScale(
  { style, scaleTo = motion.pressScale, haptic, onPressIn, onPressOut, onPress, disabled, ...rest },
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

  function handlePressIn(e: GestureResponderEvent) {
    const target = m.press(scaleTo)
    scale.value = m.timing(target.scale, "fast")
    opacity.value = m.timing(target.opacity, "fast")
    if (styleIsFn) setPressed(true)
    onPressIn?.(e)
  }

  function handlePressOut(e: GestureResponderEvent) {
    scale.value = m.spring(1, "snappy")
    opacity.value = m.timing(1, "fast")
    if (styleIsFn) setPressed(false)
    onPressOut?.(e)
  }

  function handlePress(e: GestureResponderEvent) {
    if (haptic) haptics[haptic]()
    onPress?.(e)
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
