import { useMemo } from "react"
import {
  BaseAnimationBuilder, Easing, FadeIn, FadeInDown, FadeOut, FadeOutUp, Keyframe, LinearTransition, ReduceMotion, SlideInDown, SlideInUp,
  SlideOutDown, useReducedMotion, withSequence, withSpring, withTiming, type EntryOrExitLayoutType, type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated"
import { motion, type BezierPoints, type MotionDuration, type MotionSpring } from "../theme/tokens"
import { exitDuration, pressFeedback, shakeSteps, springPlan, staggerDelay, timingPlan, type AnimationPlan } from "./motionConfig"

// The one place animations are configured. Components call useMotion() and
// use what it returns instead of hand-rolling durations, so the whole app
// moves with the same rhythm and honours the system "Remove animations"
// setting (Reanimated's useReducedMotion): under reduced motion movement is
// dropped — enters become a short fade, springs/timings jump to the end.
//
// Every layout-animation builder is created ONCE here at module load (never
// inside render), as Reanimated recommends.

const bezier = (p: BezierPoints) => Easing.bezier(p[0], p[1], p[2], p[3])

export const EASE = {
  emphasized: bezier(motion.easing.emphasizedDecelerate),
  standard: bezier(motion.easing.standard),
  accelerate: bezier(motion.easing.accelerate),
} as const

const D = motion.duration
const exit = (ms: number) => exitDuration(ms)
const RISE = 10

/** Scale-and-fade "pop" for small badges and icons (no overshoot). */
const popIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.6 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE.emphasized },
}).duration(D.base)

const popOut = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.6 }], easing: EASE.accelerate },
}).duration(exit(D.fast))

interface BuilderSet {
  /** Plain fade in/out. */
  fadeIn: EntryOrExitLayoutType
  fadeOut: EntryOrExitLayoutType
  /** Fade in while rising ~10 px (cards, text, banners). */
  riseIn: EntryOrExitLayoutType
  /** Bottom bars entering from below / leaving downwards. */
  slideUpIn: EntryOrExitLayoutType
  slideDownOut: EntryOrExitLayoutType
  /** Toasts: drop in from the top, leave upwards. */
  toastIn: EntryOrExitLayoutType
  toastOut: EntryOrExitLayoutType
  /** Badges / icons. */
  popIn: EntryOrExitLayoutType
  popOut: EntryOrExitLayoutType
  /** Siblings re-flowing when something is added/removed (never on FlashList rows). */
  layout: BaseAnimationBuilder
}

const FULL: BuilderSet = {
  fadeIn: FadeIn.duration(D.base).easing(EASE.standard),
  fadeOut: FadeOut.duration(exit(D.base)).easing(EASE.standard),
  riseIn: FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: RISE }] })
    .duration(D.base)
    .easing(EASE.emphasized),
  slideUpIn: SlideInDown.springify(motion.spring.gentle.duration).dampingRatio(motion.spring.gentle.dampingRatio),
  slideDownOut: SlideOutDown.duration(exit(D.base)).easing(EASE.accelerate),
  toastIn: SlideInUp.springify(motion.spring.gentle.duration).dampingRatio(motion.spring.gentle.dampingRatio),
  toastOut: FadeOutUp.duration(exit(D.base)).easing(EASE.accelerate),
  popIn,
  popOut,
  layout: LinearTransition.duration(D.base).easing(EASE.standard),
}

// Reduced motion: opacity only (a fade is not "motion"), so Never-reduce the
// fades themselves; everything that would move becomes that fade.
const reducedFadeIn = FadeIn.duration(D.fast).reduceMotion(ReduceMotion.Never)
const reducedFadeOut = FadeOut.duration(exit(D.fast)).reduceMotion(ReduceMotion.Never)
const REDUCED: BuilderSet = {
  fadeIn: reducedFadeIn,
  fadeOut: reducedFadeOut,
  riseIn: reducedFadeIn,
  slideUpIn: reducedFadeIn,
  slideDownOut: reducedFadeOut,
  toastIn: reducedFadeIn,
  toastOut: reducedFadeOut,
  popIn: reducedFadeIn,
  popOut: reducedFadeOut,
  // ReduceMotion.System (the default) makes this an instant re-flow.
  layout: LinearTransition.duration(D.base),
}

// Staggered "rise in" builders, cached per delay so lists never build new ones in render.
const riseCache = new Map<number, EntryOrExitLayoutType>()
function riseInAt(delay: number): EntryOrExitLayoutType {
  let b = riseCache.get(delay)
  if (!b) {
    b = FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: RISE }] })
      .duration(D.base)
      .easing(EASE.emphasized)
      .delay(delay)
    riseCache.set(delay, b)
  }
  return b
}
const fadeCache = new Map<number, EntryOrExitLayoutType>()
function fadeInAt(delay: number): EntryOrExitLayoutType {
  let b = fadeCache.get(delay)
  if (!b) {
    b = FadeIn.duration(D.fast).delay(delay).reduceMotion(ReduceMotion.Never)
    fadeCache.set(delay, b)
  }
  return b
}

const popCache = new Map<number, EntryOrExitLayoutType>()
function popInAt(delay: number): EntryOrExitLayoutType {
  let b = popCache.get(delay)
  if (!b) {
    b = new Keyframe({
      0: { opacity: 0, transform: [{ scale: 0.6 }] },
      100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE.emphasized },
    })
      .duration(D.base)
      .delay(delay)
    popCache.set(delay, b)
  }
  return b
}

function toSpring(plan: AnimationPlan): WithSpringConfig | null {
  return plan.kind === "spring" ? { duration: plan.duration, dampingRatio: plan.dampingRatio, reduceMotion: ReduceMotion.Never } : null
}

export interface Motion extends BuilderSet {
  reduced: boolean
  /** Rise-in for the i-th item of a list (30 ms steps from `base`, capped). */
  stagger: (index: number, base?: number) => EntryOrExitLayoutType
  /** Badge/icon pop after `delay` ms (the "last beat" of a sequence). */
  popAt: (delay: number) => EntryOrExitLayoutType
  /** Animate a shared value with a critically-damped spring (instant when reduced). Call from JS (handlers/effects). */
  spring: (toValue: number, preset?: MotionSpring) => number
  /** Animate a shared value with a token duration (instant when reduced). Call from JS (handlers/effects). */
  timing: (toValue: number, duration?: MotionDuration, opts?: { exit?: boolean; easing?: WithTimingConfig["easing"] }) => number
  /** Press-in target for PressableScale. */
  press: (scaleTo?: number) => { scale: number; opacity: number }
  /** translateX animation for an error shake (no-op value 0 when reduced). */
  shake: () => number
}

function build(reduced: boolean): Motion {
  const set = reduced ? REDUCED : FULL
  return {
    ...set,
    reduced,
    stagger: (index, base = 0) => (reduced ? fadeInAt(0) : riseInAt(staggerDelay(index, base))),
    popAt: (delay) => (reduced ? fadeInAt(0) : popInAt(delay)),
    spring: (toValue, preset = "snappy") => {
      const cfg = toSpring(springPlan(preset, reduced))
      return cfg ? withSpring(toValue, cfg) : withTiming(toValue, { duration: 0 })
    },
    timing: (toValue, duration = "fast", opts = {}) => {
      const plan = timingPlan(duration, reduced, opts.exit)
      return withTiming(toValue, { duration: plan.duration, easing: opts.easing ?? EASE.standard, reduceMotion: ReduceMotion.Never })
    },
    press: (scaleTo) => pressFeedback(reduced, scaleTo),
    shake: () => {
      const steps = shakeSteps(reduced)
      if (steps.length === 0) return withTiming(0, { duration: 0 })
      const [first, ...rest] = steps.map((s) => withTiming(s.to, { duration: s.duration, reduceMotion: ReduceMotion.Never }))
      return withSequence(first!, ...rest)
    },
  }
}

const FULL_MOTION = build(false)
const REDUCED_MOTION = build(true)

/** Reduced-motion-aware animation helpers (stable object per setting). */
export function useMotion(): Motion {
  const reduced = useReducedMotion()
  return useMemo(() => (reduced ? REDUCED_MOTION : FULL_MOTION), [reduced])
}
