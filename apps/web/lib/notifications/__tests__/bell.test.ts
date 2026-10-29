import { describe, expect, it } from "vitest"
import { alertStatus, stateFor } from "@/lib/notifications/bell"

const NOW = Date.UTC(2026, 9, 29, 9)
const a = { key: "low:p1", fp: "low" }

describe("alertStatus", () => {
  it("is new until seen, and new again when the alert changes", () => {
    expect(alertStatus(a, undefined, NOW)).toBe("new")
    expect(alertStatus(a, { seen_fp: "low", dismissed_fp: null, dismissed_until: null }, NOW)).toBe("seen")
    expect(alertStatus({ ...a, fp: "out" }, { seen_fp: "low", dismissed_fp: null, dismissed_until: null }, NOW)).toBe("new")
  })
  it("hides a dismissed alert until it changes", () => {
    const st = { seen_fp: "low", dismissed_fp: "low", dismissed_until: null }
    expect(alertStatus(a, st, NOW)).toBe("hidden")
    expect(alertStatus({ ...a, fp: "out" }, st, NOW)).toBe("new")
  })
  it("hides a snoozed alert until the time, whatever changes", () => {
    const st = { seen_fp: "low", dismissed_fp: null, dismissed_until: new Date(NOW + 3_600_000) }
    expect(alertStatus({ ...a, fp: "out" }, st, NOW)).toBe("hidden")
    expect(alertStatus(a, st, NOW + 7_200_000)).toBe("seen")
  })
})

describe("stateFor", () => {
  it("writes what each action means", () => {
    expect(stateFor("seen", a)).toEqual({ seen_fp: "low" })
    expect(stateFor("dismiss", a)).toEqual({ seen_fp: "low", dismissed_fp: "low", dismissed_until: null })
    expect(stateFor("snooze_week", a, new Date(NOW)).dismissed_until).toEqual(new Date(NOW + 7 * 86_400_000))
    expect(stateFor("restore", a)).toEqual({ dismissed_fp: null, dismissed_until: null })
  })
})
