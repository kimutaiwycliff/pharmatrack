import { describe, expect, it } from "vitest"
import { easeOutCubic, rollFrame, shouldRoll } from "../numberRoll"

describe("rollFrame", () => {
  it("starts at from, lands exactly on to", () => {
    expect(rollFrame(100, 2_345, 0)).toBe(100)
    expect(rollFrame(100, 2_345, 1)).toBe(2_345)
    expect(rollFrame(100, 2_345, 1.7)).toBe(2_345)
  })
  it("only ever shows integers between the ends", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const v = rollFrame(0, 99_999, t)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(99_999)
    }
  })
  it("rolls down as well as up", () => {
    const mid = rollFrame(1_000, 0, 0.5)
    expect(mid).toBeLessThan(1_000)
    expect(mid).toBeGreaterThan(0)
  })
  it("eases out", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })
})

describe("shouldRoll", () => {
  const base = { enabled: true, reduced: false, from: 100, to: 200, lastChangeAt: 0, now: 10_000 }
  it("rolls a settled change", () => expect(shouldRoll(base)).toBe(true))
  it("snaps on the first value, no change, disabled or reduced motion", () => {
    expect(shouldRoll({ ...base, from: null })).toBe(false)
    expect(shouldRoll({ ...base, to: 100 })).toBe(false)
    expect(shouldRoll({ ...base, enabled: false })).toBe(false)
    expect(shouldRoll({ ...base, reduced: true })).toBe(false)
  })
  it("snaps while typing (changes arriving in a burst)", () => {
    expect(shouldRoll({ ...base, lastChangeAt: 9_900 })).toBe(false)
    expect(shouldRoll({ ...base, lastChangeAt: 9_600 })).toBe(true)
  })
})
