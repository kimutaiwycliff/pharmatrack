import { describe, expect, it } from "vitest"
import { computeLock, overrideUntilFor, type LockInput, type OverrideRecord } from "../lock"
import { nextNairobiMidnight, nairobiAt } from "../time"

// 2026-10-12 in Nairobi (UTC+3).
const at = (iso: string) => new Date(iso).getTime()
const DEADLINE = at("2026-10-13T00:00:00+03:00")

const input = (over: Partial<LockInput> = {}): LockInput => ({
  now: at("2026-10-12T14:00:00+03:00"),
  registered: true,
  revoked: false,
  clockTampered: false,
  deadline: DEADLINE,
  override: null,
  ...over,
})

const override = (over: Partial<OverrideRecord> = {}): OverrideRecord => ({
  client_id: "ov-123456789",
  manager_id: "m1",
  manager_name: "Mary",
  at: at("2026-10-13T07:00:00+03:00"),
  until: overrideUntilFor(DEADLINE),
  deadline: DEADLINE,
  ...over,
})

describe("nairobi time", () => {
  it("next midnight is Nairobi midnight regardless of the hour", () => {
    expect(nextNairobiMidnight(at("2026-10-12T00:00:00+03:00"))).toBe(DEADLINE)
    expect(nextNairobiMidnight(at("2026-10-12T23:59:59+03:00"))).toBe(DEADLINE)
    // 22:30 UTC on the 12th is already 01:30 on the 13th in Nairobi.
    expect(nextNairobiMidnight(at("2026-10-12T22:30:00Z"))).toBe(at("2026-10-14T00:00:00+03:00"))
  })
  it("rolls months", () => {
    expect(nextNairobiMidnight(at("2026-10-31T12:00:00+03:00"))).toBe(at("2026-11-01T00:00:00+03:00"))
  })
  it("nairobiAt gives wall-clock times", () => {
    expect(nairobiAt(at("2026-10-12T05:00:00Z"), 22)).toBe(at("2026-10-12T22:00:00+03:00"))
  })
})

describe("computeLock", () => {
  it("sells normally before the deadline with no warning", () => {
    const s = computeLock(input())
    expect(s.locked).toBe(false)
    expect(s.warnDeadline).toBe(false)
  })

  it("warns from 21:00", () => {
    expect(computeLock(input({ now: at("2026-10-12T20:59:00+03:00") })).warnDeadline).toBe(false)
    const s = computeLock(input({ now: at("2026-10-12T21:00:00+03:00") }))
    expect(s.locked).toBe(false)
    expect(s.warnDeadline).toBe(true)
    expect(s.msToDeadline).toBe(3 * 3_600_000)
  })

  it("locks at midnight and offers an override until noon", () => {
    const s = computeLock(input({ now: DEADLINE }))
    expect(s.locked).toBe(true)
    expect(s.reason).toBe("deadline")
    expect(s.overrideAvailable).toBe(true)
    expect(s.overrideUntil).toBe(at("2026-10-13T12:00:00+03:00"))
  })

  it("does not offer an override after noon", () => {
    const s = computeLock(input({ now: at("2026-10-13T12:00:00+03:00") }))
    expect(s.locked).toBe(true)
    expect(s.overrideAvailable).toBe(false)
  })

  it("override unlocks until noon, then locks with no second override", () => {
    const during = computeLock(input({ now: at("2026-10-13T09:00:00+03:00"), override: override() }))
    expect(during.locked).toBe(false)
    expect(during.underOverride).toBe(true)

    const after = computeLock(input({ now: at("2026-10-13T12:00:01+03:00"), override: override() }))
    expect(after.locked).toBe(true)
    expect(after.reason).toBe("override_expired")
    expect(after.overrideAvailable).toBe(false)
  })

  it("ignores an override granted for an older deadline", () => {
    const old = override({ deadline: DEADLINE - 86_400_000, until: DEADLINE - 86_400_000 + 12 * 3_600_000 })
    const s = computeLock(input({ now: DEADLINE + 1000, override: old }))
    expect(s.reason).toBe("deadline")
    expect(s.overrideAvailable).toBe(true)
  })

  it("a successful sync (new deadline) clears the lock", () => {
    const next = at("2026-10-14T00:00:00+03:00")
    expect(computeLock(input({ now: at("2026-10-13T10:00:00+03:00"), deadline: next })).locked).toBe(false)
  })

  it("never-synced, unregistered, revoked and tampered all lock", () => {
    expect(computeLock(input({ deadline: null })).reason).toBe("never_synced")
    expect(computeLock(input({ registered: false })).reason).toBe("unregistered")
    expect(computeLock(input({ revoked: true })).reason).toBe("revoked")
    expect(computeLock(input({ clockTampered: true, override: override() })).reason).toBe("clock_changed")
  })
})
