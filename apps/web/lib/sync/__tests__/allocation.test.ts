import { describe, it, expect } from "vitest"
import { allowanceFor, shareFor } from "../allocation"
import { isLateSync, nextNairobiMidnight, reservationExpiry } from "../time"

describe("stock allowance", () => {
  it("a lone device gets all branch stock", () => {
    expect(shareFor({ salesByParticipant: new Map(), me: "d1", pinnedPercent: null })).toBe(1)
    expect(allowanceFor(37, 0, 1)).toBe(37)
  })
  it("splits by recent sales with +1 smoothing", () => {
    const share = shareFor({ salesByParticipant: new Map([["d1", 29], ["d2", 9]]), me: "d1", pinnedPercent: null })
    expect(share).toBeCloseTo(30 / 40)
    expect(shareFor({ salesByParticipant: new Map([["d1", 0], ["d2", 0]]), me: "d2", pinnedPercent: null })).toBe(0.5)
  })
  it("the web till counts as a participant", () => {
    expect(shareFor({ salesByParticipant: new Map([["web", 3], ["d1", 3]]), me: "d1", pinnedPercent: null })).toBe(0.5)
  })
  it("owner-pinned share wins", () => {
    expect(shareFor({ salesByParticipant: new Map([["d1", 100], ["d2", 0]]), me: "d1", pinnedPercent: 25 })).toBe(0.25)
  })
  it("never hands out more than other devices left free (no oversell)", () => {
    expect(allowanceFor(10, 7, 0.5)).toBe(3)   // wants 5, only 3 free
    expect(allowanceFor(10, 12, 0.5)).toBe(0)  // over-held (e.g. write-off): nothing
    expect(allowanceFor(3, 0, 0.5)).toBe(2)    // rounds up for the device
    // Two devices taking ceil shares of an odd stock still can't exceed it:
    const a = allowanceFor(5, 0, 0.5)          // 3
    const b = allowanceFor(5, a, 0.5)          // min(2 free, 3) = 2
    expect(a + b).toBe(5)
  })
})

describe("daily deadline", () => {
  it("next midnight is the start of the next Nairobi day", () => {
    expect(nextNairobiMidnight(new Date("2026-10-12T21:30:00Z")).toISOString()).toBe("2026-10-13T21:00:00.000Z") // 00:30 EAT on the 13th → midnight 13/14
    expect(nextNairobiMidnight(new Date("2026-10-12T09:00:00Z")).toISOString()).toBe("2026-10-12T21:00:00.000Z")
    expect(nextNairobiMidnight(new Date("2026-10-31T10:00:00Z")).toISOString()).toBe("2026-10-31T21:00:00.000Z")
    expect(nextNairobiMidnight(new Date("2026-12-31T10:00:00Z")).toISOString()).toBe("2026-12-31T21:00:00.000Z")
  })
  it("reservations outlive midnight by the override grace (until noon)", () => {
    expect(reservationExpiry(new Date("2026-10-12T09:00:00Z")).toISOString()).toBe("2026-10-13T09:00:00.000Z")
  })
  it("late sync = received after the sale day's midnight", () => {
    const sold = new Date("2026-10-12T19:00:00Z") // 22:00 EAT
    expect(isLateSync(sold, new Date("2026-10-12T20:59:00Z"))).toBe(false)
    expect(isLateSync(sold, new Date("2026-10-12T21:01:00Z"))).toBe(true)
  })
})
