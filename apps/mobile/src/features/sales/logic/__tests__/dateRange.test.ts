import { describe, expect, it } from "vitest"
import { dateRangeFor } from "../dateRange"

// 12 Oct 2026 23:30 Nairobi = 20:30 UTC — late evening, where a UTC-based
// "today" would still be right but 01:30 Nairobi (22:30 UTC the day before)
// would not.
const evening = Date.parse("2026-10-12T20:30:00Z")
const earlyMorning = Date.parse("2026-10-12T22:30:00Z") // 13 Oct 01:30 Nairobi

describe("dateRangeFor", () => {
  it("today runs Nairobi midnight to midnight", () => {
    expect(dateRangeFor("today", evening)).toEqual({ from: "2026-10-11T21:00:00.000Z", to: "2026-10-12T20:59:59.999Z" })
  })
  it("uses the Nairobi day, not the UTC day, just after midnight", () => {
    expect(dateRangeFor("today", earlyMorning).from).toBe("2026-10-12T21:00:00.000Z")
  })
  it("yesterday is the whole previous Nairobi day", () => {
    expect(dateRangeFor("yesterday", evening)).toEqual({ from: "2026-10-10T21:00:00.000Z", to: "2026-10-11T20:59:59.999Z" })
  })
  it("7 and 30 days include today", () => {
    expect(dateRangeFor("7d", evening)).toEqual({ from: "2026-10-05T21:00:00.000Z", to: "2026-10-12T20:59:59.999Z" })
    expect(dateRangeFor("30d", evening).from).toBe("2026-09-12T21:00:00.000Z")
  })
})
