import { describe, expect, it } from "vitest"
import { effectiveStatus, intervalLabel, paymentBadge, pendingPayment, renewalInfo, subscriptionBadge, type BillingSubscription } from "../billing"

const now = new Date("2026-10-12T09:00:00+03:00")
const sub = (over: Partial<BillingSubscription> = {}): BillingSubscription => ({
  status: "active",
  current_period_end: "2026-10-20T20:59:59.999Z",
  trial_ends_at: null,
  plan: { name: "Growth", price_kes: 2500, interval: "monthly" },
  ...over,
})

describe("effectiveStatus", () => {
  it("prefers the server's effective status", () => {
    expect(effectiveStatus(sub({ effective_status: "past_due" }))).toBe("past_due")
    expect(effectiveStatus(sub())).toBe("active")
    expect(effectiveStatus(null)).toBe("none")
  })
})

describe("renewalInfo", () => {
  it("shows the trial end while trialing", () => {
    const r = renewalInfo(sub({ status: "trialing", trial_ends_at: "2026-10-14T20:59:59.999Z" }), now)
    expect(r.label).toBe("Trial ends")
    expect(r.countdown).toBe("In 3 days")
    expect(r.soon).toBe(true)
  })
  it("shows the paid-until date when active", () => {
    const r = renewalInfo(sub(), now)
    expect(r.label).toBe("Active until")
    expect(r.daysLeft).toBe(9)
    expect(r.soon).toBe(false)
  })
  it("has no countdown once expired", () => {
    const r = renewalInfo(sub({ effective_status: "suspended", current_period_end: "2026-10-01T00:00:00Z" }), now)
    expect(r.label).toBe("Expired on")
    expect(r.countdown).toBeNull()
  })
})

describe("labels", () => {
  it("names statuses and intervals", () => {
    expect(subscriptionBadge("past_due")).toEqual({ tone: "warning", label: "Past due" })
    expect(subscriptionBadge("weird_state").label).toBe("weird state")
    expect(paymentBadge("pending").tone).toBe("warning")
    expect(intervalLabel("annual")).toBe("year")
  })
  it("finds a pending claim", () => {
    expect(pendingPayment([{ id: "1", amount_kes: 1, method: null, reference: null, created_at: "", status: "confirmed" }])).toBeNull()
  })
})
