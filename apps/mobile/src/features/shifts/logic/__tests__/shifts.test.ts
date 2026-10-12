import { describe, expect, it } from "vitest"
import {
  expectedCashCents,
  isOpenShift,
  kesToCents,
  parseOptionalCash,
  remoteOpenShifts,
  shiftBadge,
  shiftTimeRange,
  varianceExplanation,
} from "../shifts"

describe("kesToCents", () => {
  it("converts decimal KES numbers and strings", () => {
    expect(kesToCents(12.34)).toBe(1234)
    expect(kesToCents("1500.50")).toBe(150050)
    expect(kesToCents(0.1 + 0.2)).toBe(30)
    expect(kesToCents(null)).toBe(0)
    expect(kesToCents("abc")).toBe(0)
  })
})

describe("isOpenShift", () => {
  it("is open only while not clocked out", () => {
    expect(isOpenShift({ clocked_out_at: null, closing_cash: null })).toBe(true)
    // Force-closed: no count, but closed.
    expect(isOpenShift({ clocked_out_at: "2026-10-01T10:00:00Z", closing_cash: null })).toBe(false)
    expect(isOpenShift({ clocked_out_at: "2026-10-01T10:00:00Z", closing_cash: 500 })).toBe(false)
  })
})

describe("expectedCashCents / varianceExplanation", () => {
  it("adds float and cash sales", () => {
    expect(expectedCashCents(100000, 25050)).toBe(125050)
  })
  it("explains over, short, balanced and missing counts", () => {
    expect(varianceExplanation(5000)).toBe("Counted KES 50.00 more than expected.")
    expect(varianceExplanation(-120000)).toBe("Counted KES 1,200.00 less than expected.")
    expect(varianceExplanation(0)).toBe("Counted cash matches what was expected.")
    expect(varianceExplanation(null)).toBe("No cash count was recorded for this shift.")
  })
})

describe("shiftTimeRange", () => {
  it("shows only the end time when the shift ends the same Nairobi day", () => {
    // 05:00Z = 08:00 Nairobi, 14:30Z = 17:30 Nairobi
    expect(shiftTimeRange("2026-03-12T05:00:00Z", "2026-03-12T14:30:00Z")).toBe("12 Mar 2026, 08:00 – 17:30")
  })
  it("shows the full end date across midnight (Nairobi)", () => {
    // 22:30Z on the 12th is 01:30 on the 13th in Nairobi
    expect(shiftTimeRange("2026-03-12T15:00:00Z", "2026-03-12T22:30:00Z")).toBe("12 Mar 2026, 18:00 – 13 Mar 2026, 01:30")
  })
  it("marks open shifts", () => {
    expect(shiftTimeRange("2026-03-12T05:00:00Z", null)).toBe("12 Mar 2026, 08:00 · still open")
  })
})

describe("remoteOpenShifts", () => {
  const opened = "2026-10-01T05:00:00.000Z"
  const base = { closing_cash: null, clocked_out_at: null, clocked_in_at: opened }
  const server = [
    { ...base, id: "a", staff_id: "me" },
    { ...base, id: "b", staff_id: "on-this-phone" },
    { ...base, id: "c", staff_id: "elsewhere" },
    { ...base, id: "d", staff_id: "closed", clocked_out_at: "2026-10-01T09:00:00Z" },
    // Same person as a local shift but a different (older) shift — still remote.
    { ...base, id: "e", staff_id: "on-this-phone", clocked_in_at: "2026-09-30T05:00:00.000Z" },
  ]
  const local = [{ cashierId: "on-this-phone", openedAt: new Date(opened).getTime() + 400 }]

  it("drops my own, closed ones and ones that live on this phone", () => {
    expect(remoteOpenShifts(server, local, "me").map((s) => s.id)).toEqual(["c", "e"])
  })
  it("keeps everyone's open shifts when nobody is selected", () => {
    expect(remoteOpenShifts(server, [], null).map((s) => s.id)).toEqual(["a", "b", "c", "e"])
  })
})

describe("parseOptionalCash", () => {
  it("treats blank as no count", () => {
    expect(parseOptionalCash("  ")).toEqual({ ok: true, cents: null })
  })
  it("parses amounts with commas and up to 2 decimals", () => {
    expect(parseOptionalCash("1,250.5")).toEqual({ ok: true, cents: 125050 })
    expect(parseOptionalCash("0")).toEqual({ ok: true, cents: 0 })
  })
  it("rejects junk and negatives", () => {
    expect(parseOptionalCash("-5")).toEqual({ ok: false })
    expect(parseOptionalCash("12.345")).toEqual({ ok: false })
    expect(parseOptionalCash("abc")).toEqual({ ok: false })
  })
})

describe("shiftBadge", () => {
  it("labels open, no-count, balanced, over and short shifts", () => {
    expect(shiftBadge({ clocked_out_at: null, closing_cash: null, variance: null }).label).toBe("Open")
    expect(shiftBadge({ clocked_out_at: "x", closing_cash: null, variance: null })).toEqual({ label: "No count", status: "neutral" })
    expect(shiftBadge({ clocked_out_at: "x", closing_cash: 100, variance: 10 })).toEqual({ label: "Balanced", status: "ok" })
    expect(shiftBadge({ clocked_out_at: "x", closing_cash: 100, variance: 120 })).toEqual({ label: "Over", status: "warning" })
    expect(shiftBadge({ clocked_out_at: "x", closing_cash: 100, variance: -800 })).toEqual({ label: "Short", status: "danger" })
  })
})
