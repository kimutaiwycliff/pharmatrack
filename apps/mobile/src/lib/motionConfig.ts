import { motion, type MotionDuration, type MotionSpring } from "../theme/tokens"

// Pure motion decisions (no React Native / Reanimated imports — vitest runs
// these). src/lib/motion.ts turns the plans below into Reanimated configs and
// layout-animation builders; keeping the "what happens under reduced motion"
// rules here makes them testable and identical everywhere.

/** How a value change should animate. */
export type AnimationPlan =
  | { kind: "spring"; duration: number; dampingRatio: number }
  | { kind: "timing"; duration: number }

/** Spring for normal motion; an instant jump when the person asked for reduced motion. */
export function springPlan(preset: MotionSpring, reduced: boolean): AnimationPlan {
  if (reduced) return { kind: "timing", duration: 0 }
  const s = motion.spring[preset]
  return { kind: "spring", duration: s.duration, dampingRatio: s.dampingRatio }
}

/** Timing for normal motion; instant under reduced motion. */
export function timingPlan(duration: MotionDuration, reduced: boolean, exit = false): AnimationPlan {
  if (reduced) return { kind: "timing", duration: 0 }
  return { kind: "timing", duration: exitDuration(motion.duration[duration], exit) }
}

/** Exits run ~30% faster than the matching enter. */
export function exitDuration(enterMs: number, exit = true): number {
  return exit ? Math.round(enterMs * motion.exitFactor) : enterMs
}

/** Which flavour of enter/exit a component gets: movement + fade, or a plain fade. */
export type TransitionStyle = "move" | "fade"
export const transitionStyle = (reduced: boolean): TransitionStyle => (reduced ? "fade" : "move")

/** Delay for the i-th item of a list entering together (30 ms steps, capped). */
export function staggerDelay(index: number, base = 0, step: number = motion.stagger, max: number = motion.staggerMax): number {
  return base + Math.min(Math.max(0, index), max) * step
}

/** Press feedback: scale for normal motion, a gentle dim (no movement) under reduced motion. */
export function pressFeedback(reduced: boolean, scaleTo: number = motion.pressScale): { scale: number; opacity: number } {
  return reduced ? { scale: 1, opacity: 0.7 } : { scale: scaleTo, opacity: 1 }
}

/** Shake keyframes (translateX) for a wrong PIN / failed sign-in: ±6 px × 3, ~250 ms. */
export function shakeSteps(reduced: boolean, distance = 6): { to: number; duration: number }[] {
  if (reduced) return []
  const step = 40
  return [
    { to: -distance, duration: step / 2 },
    { to: distance, duration: step },
    { to: -distance, duration: step },
    { to: distance, duration: step },
    { to: -distance, duration: step },
    { to: distance, duration: step },
    { to: 0, duration: step / 2 },
  ]
}
