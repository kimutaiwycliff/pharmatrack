import { describe, expect, it } from "vitest"
import { anchorsAfterSync, EMPTY_ANCHORS, observeClock, trustedNow } from "../clock"
import { afterPinAttempt, lockoutMinutesLeft, LOCKOUT_MS } from "../lockout"

const MIN = 60_000

describe("clock tamper guard", () => {
  it("tracks the highest device time seen", () => {
    let a = observeClock(EMPTY_ANCHORS, 1_000 * MIN)
    a = observeClock(a, 1_001 * MIN)
    expect(a.lastSeenDeviceTime).toBe(1_001 * MIN)
    expect(a.tampered).toBe(false)
  })

  it("tolerates small backwards drift (≤ 5 min)", () => {
    const a = observeClock(observeClock(EMPTY_ANCHORS, 1_000 * MIN), 995 * MIN)
    expect(a.tampered).toBe(false)
    expect(a.lastSeenDeviceTime).toBe(1_000 * MIN)
  })

  it("flags a jump back of more than 5 minutes and stays flagged", () => {
    let a = observeClock(observeClock(EMPTY_ANCHORS, 1_000 * MIN), 994 * MIN)
    expect(a.tampered).toBe(true)
    a = observeClock(a, 2_000 * MIN) // moving the clock forward again doesn't clear it
    expect(a.tampered).toBe(true)
  })

  it("forward jumps are not tampering", () => {
    const a = observeClock(observeClock(EMPTY_ANCHORS, 1_000 * MIN), 5_000 * MIN)
    expect(a.tampered).toBe(false)
  })

  it("a successful sync clears the flag and re-anchors", () => {
    const a = anchorsAfterSync(10_000 * MIN, 9_000 * MIN)
    expect(a.tampered).toBe(false)
    expect(a.lastSeenDeviceTime).toBe(9_000 * MIN)
  })

  it("trustedNow corrects a constantly-skewed phone clock", () => {
    // Phone runs 3 hours slow: server said 12:00 when the phone said 09:00.
    const a = anchorsAfterSync(12 * 60 * MIN, 9 * 60 * MIN)
    expect(trustedNow(a, 9 * 60 * MIN + 30 * MIN)).toBe(12 * 60 * MIN + 30 * MIN)
    expect(trustedNow(EMPTY_ANCHORS, 42)).toBe(42)
  })
})

describe("PIN lockout", () => {
  it("locks after 5 failures for 15 minutes, resets on success", () => {
    let s = { failedAttempts: 0, lockedUntil: null as number | null }
    for (let i = 0; i < 4; i++) s = afterPinAttempt(s, false, 0)
    expect(s.lockedUntil).toBeNull()
    s = afterPinAttempt(s, false, 0)
    expect(s.lockedUntil).toBe(LOCKOUT_MS)
    expect(lockoutMinutesLeft(s, 0)).toBe(15)
    expect(lockoutMinutesLeft(s, LOCKOUT_MS)).toBe(0)
    // After expiry a wrong PIN starts a fresh count instead of re-locking.
    s = afterPinAttempt(s, false, LOCKOUT_MS + 1)
    expect(s).toEqual({ failedAttempts: 1, lockedUntil: null })
    expect(afterPinAttempt(s, true, 0)).toEqual({ failedAttempts: 0, lockedUntil: null })
  })
})
