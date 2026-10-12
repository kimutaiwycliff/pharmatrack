import { describe, it, expect } from "vitest"
import { addDaysToDay, addMonthsToDay, coverageFor, endOfNairobiDay, nairobiDay, periodsForAmount, trialEndsAt } from "../period"

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

describe("addDaysToDay", () => {
  it("adds days across month and year ends", () => {
    expect(addDaysToDay("2026-10-12", 14)).toBe("2026-10-26")
    expect(addDaysToDay("2026-10-25", 14)).toBe("2026-11-08")
    expect(addDaysToDay("2026-12-25", 14)).toBe("2027-01-08")
  })
  it("handles leap years and negative offsets", () => {
    expect(addDaysToDay("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDaysToDay("2027-02-28", 1)).toBe("2027-03-01")
    expect(addDaysToDay("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDaysToDay("2026-10-12", 0)).toBe("2026-10-12")
  })
})

describe("trialEndsAt", () => {
  it("ends at 23:59:59.999 EAT, 14 Nairobi days later", () => {
    // 22:30 UTC on 11 Oct is already 12 Oct (01:30) in Nairobi.
    const end = trialEndsAt(14, new Date("2026-10-11T22:30:00Z"))
    expect(end.toISOString()).toBe("2026-10-26T20:59:59.999Z")
  })
  it("uses the Nairobi day, not the UTC day", () => {
    const end = trialEndsAt(14, new Date("2026-10-12T10:00:00Z"))
    expect(nairobiDay(end)).toBe("2026-10-26")
  })
})
