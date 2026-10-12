import { describe, it, expect } from "vitest"
import { addMonthsToDay, coverageFor, endOfNairobiDay, nairobiDay, periodsForAmount } from "../period"

describe("addMonthsToDay", () => {
  it("adds months and rolls the year", () => {
    expect(addMonthsToDay("2026-10-12", 1)).toBe("2026-11-12")
    expect(addMonthsToDay("2026-12-15", 1)).toBe("2027-01-15")
    expect(addMonthsToDay("2026-10-12", 12)).toBe("2027-10-12")
  })
  it("clamps month ends instead of overflowing", () => {
    expect(addMonthsToDay("2027-01-31", 1)).toBe("2027-02-28")
    expect(addMonthsToDay("2028-01-31", 1)).toBe("2028-02-29")
    expect(addMonthsToDay("2026-08-31", 1)).toBe("2026-09-30")
  })
})

describe("coverageFor", () => {
  const paidAt = new Date("2026-10-12T09:00:00+03:00")
  it("expired / no period: starts on the payment day", () => {
    expect(coverageFor({ currentPeriodEnd: null, paidAt, interval: "monthly", periods: 1 })).toEqual({ start: "2026-10-12", end: "2026-11-12" })
    expect(coverageFor({ currentPeriodEnd: "2026-09-30T20:59:59.999Z", paidAt, interval: "monthly", periods: 1 }).start).toBe("2026-10-12")
  })
  it("early payment stacks on top of the remaining time", () => {
    expect(coverageFor({ currentPeriodEnd: endOfNairobiDay("2026-10-20"), paidAt, interval: "monthly", periods: 1 })).toEqual({ start: "2026-10-20", end: "2026-11-20" })
  })
  it("multiple periods and annual plans", () => {
    expect(coverageFor({ currentPeriodEnd: null, paidAt, interval: "monthly", periods: 3 }).end).toBe("2027-01-12")
    expect(coverageFor({ currentPeriodEnd: null, paidAt, interval: "annual", periods: 1 }).end).toBe("2027-10-12")
  })
  it("uses the Nairobi calendar day, not UTC", () => {
    // 22:30 UTC on the 11th is already the 12th in Nairobi.
    expect(nairobiDay(new Date("2026-10-11T22:30:00Z"))).toBe("2026-10-12")
    expect(endOfNairobiDay("2026-11-12").toISOString()).toBe("2026-11-12T20:59:59.999Z")
  })
})

describe("periodsForAmount", () => {
  it("rounds to whole periods, minimum one", () => {
    expect(periodsForAmount(4500, 4500)).toBe(1)
    expect(periodsForAmount(13500, 4500)).toBe(3)
    expect(periodsForAmount(4000, 4500)).toBe(1)
    expect(periodsForAmount(100, 4500)).toBe(1)
    expect(periodsForAmount(5000, null)).toBe(1)
  })
})
