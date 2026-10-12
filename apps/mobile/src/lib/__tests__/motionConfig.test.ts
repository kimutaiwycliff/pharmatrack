import { describe, expect, it } from "vitest"
import { motion } from "../../theme/tokens"
import { exitDuration, pressFeedback, shakeSteps, springPlan, staggerDelay, timingPlan, transitionStyle } from "../motionConfig"

describe("motion config", () => {
  it("uses critically damped springs normally", () => {
    for (const preset of ["snappy", "gentle", "sheet"] as const) {
      const plan = springPlan(preset, false)
      expect(plan.kind).toBe("spring")
      if (plan.kind === "spring") expect(plan.dampingRatio).toBe(1)
    }
  })

  it("jumps instantly under reduced motion", () => {
    expect(springPlan("gentle", true)).toEqual({ kind: "timing", duration: 0 })
    expect(timingPlan("base", true)).toEqual({ kind: "timing", duration: 0 })
    expect(timingPlan("slow", true, true)).toEqual({ kind: "timing", duration: 0 })
  })

  it("token timings, exits ~30% faster", () => {
    expect(timingPlan("base", false)).toEqual({ kind: "timing", duration: motion.duration.base })
    expect(timingPlan("base", false, true)).toEqual({ kind: "timing", duration: Math.round(motion.duration.base * 0.7) })
    expect(exitDuration(200)).toBe(140)
    expect(exitDuration(200, false)).toBe(200)
  })

  it("keeps durations inside the motion budget", () => {
    expect(motion.duration.fast).toBeGreaterThanOrEqual(100)
    expect(motion.duration.fast).toBeLessThanOrEqual(150)
    expect(motion.duration.base).toBeGreaterThanOrEqual(200)
    expect(motion.duration.base).toBeLessThanOrEqual(250)
    expect(motion.duration.slow).toBeLessThanOrEqual(300)
  })

  it("fades instead of moving under reduced motion", () => {
    expect(transitionStyle(true)).toBe("fade")
    expect(transitionStyle(false)).toBe("move")
  })

  it("press feedback: scale normally, dim (no movement) when reduced", () => {
    expect(pressFeedback(false)).toEqual({ scale: motion.pressScale, opacity: 1 })
    expect(pressFeedback(false, 0.9)).toEqual({ scale: 0.9, opacity: 1 })
    expect(pressFeedback(true)).toEqual({ scale: 1, opacity: 0.7 })
  })

  it("staggers in 30 ms steps, capped", () => {
    expect(staggerDelay(0)).toBe(0)
    expect(staggerDelay(2, 100)).toBe(160)
    expect(staggerDelay(50)).toBe(motion.staggerMax * motion.stagger)
    expect(staggerDelay(-3)).toBe(0)
  })

  it("shake is ±6 px three times in ~250 ms, and nothing when reduced", () => {
    const steps = shakeSteps(false)
    const total = steps.reduce((s, x) => s + x.duration, 0)
    expect(total).toBeGreaterThanOrEqual(200)
    expect(total).toBeLessThanOrEqual(260)
    expect(steps.filter((x) => x.to === 6)).toHaveLength(3)
    expect(steps.at(-1)?.to).toBe(0)
    expect(shakeSteps(true)).toEqual([])
  })
})
