import { describe, expect, it } from "vitest"
import { computeHealth, type HealthInput } from "@/lib/insights/health"
import { digestEmail, digestSections, isDigestTime, isoWeekKey } from "@/lib/insights/digest"
import { sourceFromUserAgent } from "@/lib/insights/activity"
import type { Overview, TenantOverview } from "@/lib/insights/overview"

const DAY = 86_400_000
const NOW = Date.parse("2026-10-23T09:00:00Z")

const base: HealthInput = {
  now: NOW, createdAt: NOW - 60 * DAY, lastActiveAt: NOW - 3_600_000, firstSaleAt: NOW - 50 * DAY,
  revenue30: 50_000, revenuePrev30: 48_000, activeStaff30: 2, staffCount: 2, subscriptionStatus: "active", renewsAt: NOW + 20 * DAY,
}

describe("computeHealth", () => {
  it("healthy when used today and sales hold up", () => {
    const h = computeHealth(base)
    expect(h.level).toBe("healthy")
    expect(h.reasons).toEqual([])
  })

  it("grades idle time: slipping, at risk, inactive", () => {
    expect(computeHealth({ ...base, lastActiveAt: NOW - 5 * DAY }).level).toBe("slipping")
    expect(computeHealth({ ...base, lastActiveAt: NOW - 10 * DAY }).level).toBe("at_risk")
    const inactive = computeHealth({ ...base, lastActiveAt: NOW - 20 * DAY })
    expect(inactive.level).toBe("inactive")
    expect(inactive.reasons[0]).toBe("No activity in 20 days")
  })

  it("flags a big sales drop even when they still sign in", () => {
    const h = computeHealth({ ...base, revenue30: 10_000, revenuePrev30: 40_000 })
    expect(h.level).toBe("slipping")
    expect(h.reasons).toContain("Sales down 75% vs the previous 30 days")
  })

  it("new vs never started (no first sale)", () => {
    expect(computeHealth({ ...base, createdAt: NOW - 3 * DAY, firstSaleAt: null, lastActiveAt: null }).level).toBe("new")
    const never = computeHealth({ ...base, createdAt: NOW - 12 * DAY, firstSaleAt: null })
    expect(never.level).toBe("never_started")
    expect(never.reasons[0]).toBe("No sale yet — signed up 12 days ago")
  })

  it("adds billing and staff reasons", () => {
    const h = computeHealth({ ...base, subscriptionStatus: "trialing", renewsAt: NOW + 2 * DAY, activeStaff30: 1, staffCount: 4 })
    expect(h.reasons).toContain("1 of 4 staff active this month")
    expect(h.reasons).toContain("Trial ends in 2 days")
    expect(computeHealth({ ...base, subscriptionStatus: "past_due" }).reasons).toContain("Subscription payment overdue")
  })

  it("ranks who needs a call first", () => {
    const order = ["healthy", "new", "slipping", "at_risk", "never_started", "inactive"] as const
    const urg = [
      computeHealth(base), computeHealth({ ...base, createdAt: NOW - DAY, firstSaleAt: null }), computeHealth({ ...base, lastActiveAt: NOW - 5 * DAY }),
      computeHealth({ ...base, lastActiveAt: NOW - 9 * DAY }), computeHealth({ ...base, firstSaleAt: null }), computeHealth({ ...base, lastActiveAt: null }),
    ]
    expect(urg.map((u) => u.level)).toEqual([...order])
    expect([...urg].sort((a, b) => a.urgency - b.urgency).map((u) => u.level)).toEqual([...order])
  })
})

describe("weekly digest", () => {
  it("one key per ISO week, Nairobi time", () => {
    expect(isoWeekKey(Date.parse("2026-10-23T09:00:00Z"))).toBe("2026-W43")
    expect(isoWeekKey(Date.parse("2026-10-25T20:59:00Z"))).toBe("2026-W43") // Sunday 23:59 EAT
    expect(isoWeekKey(Date.parse("2026-10-25T21:00:00Z"))).toBe("2026-W44") // Monday 00:00 EAT
    expect(isoWeekKey(Date.parse("2027-01-01T09:00:00Z"))).toBe("2026-W53")
  })

  it("goes out Monday from 07:00 Nairobi", () => {
    expect(isDigestTime(Date.parse("2026-10-26T03:59:00Z"))).toBe(false) // Mon 06:59 EAT
    expect(isDigestTime(Date.parse("2026-10-26T04:00:00Z"))).toBe(true) // Mon 07:00 EAT
    expect(isDigestTime(Date.parse("2026-10-27T05:00:00Z"))).toBe(false) // Tuesday
  })

  function tenant(id: string, over: Partial<TenantOverview>): TenantOverview {
    return {
      id, name: `Pharmacy ${id}`, createdAt: NOW - 90 * DAY, subscriptionStatus: "active", renewsAt: null, lastNoteAt: null, followUpOn: null,
      health: computeHealth(base), revenue30: 0, revenuePrev30: 0, ...over,
    }
  }

  it("lists the pharmacies to call, trials ending and follow-ups", () => {
    const o = {
      platform: { mrr: 9000, collected30: 9000, tenants: 4, revenue30: 1e6, profit30: 3e5, stockCost: 2e6, stockRetail: 3e6, active7: 2, trialsEnding7: 1, newSignups30: 1, atRisk: 2, health: {} },
      daily: [],
      tenants: [
        tenant("a", {}),
        tenant("b", { health: computeHealth({ ...base, lastActiveAt: NOW - 20 * DAY }), name: "Quiet <Chemist>" }),
        tenant("c", { subscriptionStatus: "trialing", renewsAt: NOW + 3 * DAY }),
        tenant("d", { followUpOn: "2026-10-25", health: computeHealth({ ...base, lastActiveAt: NOW - 9 * DAY }) }),
      ],
    } as unknown as Overview
    const s = digestSections(o, NOW)
    expect(s.attention.map((t) => t.id)).toEqual(["b", "d"]) // inactive before at risk
    expect(s.trialsEnding.map((t) => t.id)).toEqual(["c"])
    expect(s.followUps.map((t) => t.id)).toEqual(["d"])
    const mail = digestEmail(o, "https://pharmatrack.co.ke", NOW)
    expect(mail.subject).toBe("PharmaTrack weekly: 2 pharmacies need a call")
    expect(mail.html).toContain("Quiet &lt;Chemist&gt;") // names are escaped
    expect(mail.html).toContain("https://pharmatrack.co.ke/platform/b")
  })
})

describe("sourceFromUserAgent", () => {
  it("tells the phone app from a browser", () => {
    expect(sourceFromUserAgent("okhttp/4.12.0")).toBe("android")
    expect(sourceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe("web")
    expect(sourceFromUserAgent(null)).toBe("web")
  })
})
