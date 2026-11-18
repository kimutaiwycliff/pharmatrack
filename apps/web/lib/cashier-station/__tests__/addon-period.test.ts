import { describe, it, expect } from "vitest"
import { addonCoverage, addonStatusView } from "../addon-period"

describe("add-on coverage", () => {
  it("covers a month from today, inclusive", () => {
    expect(addonCoverage(null, "2026-11-18", 1)).toEqual({ start: "2026-11-18", end: "2026-12-17" })
    expect(addonCoverage(null, "2026-11-18", 3)).toEqual({ start: "2026-11-18", end: "2027-02-17" })
  })

  it("continues from the current end when paid early", () => {
    expect(addonCoverage("2026-12-17", "2026-12-10", 1)).toEqual({ start: "2026-12-18", end: "2027-01-17" })
    expect(addonCoverage("2026-12-17", "2026-12-17", 1)).toEqual({ start: "2026-12-18", end: "2027-01-17" })
  })

  it("starts again from today after a lapse", () => {
    expect(addonCoverage("2026-10-01", "2026-11-18", 1)).toEqual({ start: "2026-11-18", end: "2026-12-17" })
  })
})

describe("add-on status", () => {
  const today = "2026-11-18"
  it("reads the stored row", () => {
    expect(addonStatusView(null, today)).toBe("none")
    expect(addonStatusView({ status: "requested", paid_until: null }, today)).toBe("requested")
    expect(addonStatusView({ status: "active", paid_until: null }, today)).toBe("active")
    expect(addonStatusView({ status: "active", paid_until: "2026-11-18" }, today)).toBe("active")
    expect(addonStatusView({ status: "active", paid_until: "2026-11-17" }, today)).toBe("lapsed")
    expect(addonStatusView({ status: "cancelled", paid_until: "2026-12-01" }, today)).toBe("cancelled")
  })
})
