import { describe, expect, it } from "vitest"
import { daysUntil, nairobiDayOf, nairobiToday, parseISODate, toISODate } from "../dates"

describe("dates", () => {
  it("round-trips calendar dates without a UTC shift", () => {
    expect(toISODate(parseISODate("2026-03-12")!)).toBe("2026-03-12")
    expect(parseISODate("garbage")).toBeNull()
  })

  it("uses Nairobi's day, not UTC's", () => {
    // 22:30 UTC is already the next day in Nairobi (UTC+3).
    expect(nairobiToday(new Date("2026-03-11T22:30:00Z"))).toBe("2026-03-12")
    expect(nairobiDayOf("2026-03-11T20:30:00Z")).toBe("2026-03-11")
  })

  it("counts days until a date from Nairobi today", () => {
    const now = new Date("2026-03-12T06:00:00Z")
    expect(daysUntil("2026-03-12", now)).toBe(0)
    expect(daysUntil("2026-06-10", now)).toBe(90)
    expect(daysUntil("2026-03-01", now)).toBe(-11)
  })
})
