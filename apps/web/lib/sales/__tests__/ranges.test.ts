import { describe, expect, it } from "vitest"
import { presetOf, rangeFor } from "../ranges"

// Thursday 29 Oct 2026, 01:30 in Nairobi = 22:30 UTC on the 28th.
const EARLY = new Date("2026-10-28T22:30:00Z")
// Same Thursday, midday.
const NOON = new Date("2026-10-29T09:00:00Z")

describe("rangeFor", () => {
  it("uses the Nairobi day, not the UTC one", () => {
    expect(rangeFor("today", EARLY)).toEqual({ from: "2026-10-29", to: "2026-10-29" })
    expect(rangeFor("yesterday", EARLY)).toEqual({ from: "2026-10-28", to: "2026-10-28" })
  })
  it("starts the week on Monday", () => {
    expect(rangeFor("this_week", NOON)).toEqual({ from: "2026-10-26", to: "2026-10-29" })
    // A Monday is its own week start; a Sunday goes back six days.
    expect(rangeFor("this_week", new Date("2026-10-26T09:00:00Z")).from).toBe("2026-10-26")
    expect(rangeFor("this_week", new Date("2026-11-01T09:00:00Z")).from).toBe("2026-10-26")
  })
  it("months", () => {
    expect(rangeFor("this_month", NOON)).toEqual({ from: "2026-10-01", to: "2026-10-29" })
    expect(rangeFor("last_month", NOON)).toEqual({ from: "2026-09-01", to: "2026-09-30" })
    expect(rangeFor("last_month", new Date("2026-03-10T09:00:00Z"))).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(rangeFor("last_month", new Date("2027-01-05T09:00:00Z"))).toEqual({ from: "2026-12-01", to: "2026-12-31" })
  })
  it("last 30 days includes today", () => {
    expect(rangeFor("last_30", NOON)).toEqual({ from: "2026-09-30", to: "2026-10-29" })
  })
})

describe("presetOf", () => {
  it("names a matching range, or null for a custom one", () => {
    expect(presetOf({ from: "2026-10-01", to: "2026-10-29" }, NOON)).toBe("this_month")
    expect(presetOf({ from: "2026-10-03", to: "2026-10-09" }, NOON)).toBeNull()
  })
})
