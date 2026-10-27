import { describe, expect, it } from "vitest"
import { campaignEmail, campaignGroup } from "@/lib/notifications/campaign"

const NOW = Date.UTC(2026, 9, 27)
const DAY = 86_400_000
const t = (over: Partial<Parameters<typeof campaignGroup>[0]> = {}) => ({
  name: "Uzima Chemist", setupStage: "no_products" as const, subscriptionStatus: "trialing", renewsAt: NOW + 5 * DAY, ...over,
})

describe("campaignGroup", () => {
  it("offers trial pharmacies that aren't selling an extension", () => {
    expect(campaignGroup(t(), NOW)).toBe("extend")
    expect(campaignGroup(t({ setupStage: "no_sale" }), NOW)).toBe("extend")
  })
  it("invites back pharmacies whose trial ended in the last 60 days, not older", () => {
    expect(campaignGroup(t({ subscriptionStatus: "cancelled", renewsAt: NOW - 20 * DAY }), NOW)).toBe("extend")
    expect(campaignGroup(t({ subscriptionStatus: "suspended", renewsAt: NOW - 61 * DAY }), NOW)).toBeNull()
    expect(campaignGroup(t({ subscriptionStatus: null, renewsAt: null }), NOW)).toBeNull()
  })
  it("nudges paying pharmacies that aren't selling yet", () => {
    expect(campaignGroup(t({ subscriptionStatus: "active", setupStage: "no_stock" }), NOW)).toBe("nudge")
  })
  it("tells selling pharmacies what's next, only while trialing or active", () => {
    expect(campaignGroup(t({ setupStage: "selling" }), NOW)).toBe("selling")
    expect(campaignGroup(t({ setupStage: "selling", subscriptionStatus: "active" }), NOW)).toBe("selling")
    expect(campaignGroup(t({ setupStage: "selling", subscriptionStatus: "cancelled", renewsAt: NOW - DAY }), NOW)).toBeNull()
  })
  it("skips test/demo pharmacies and opt-outs", () => {
    expect(campaignGroup(t({ name: "Test Pharmacy" }), NOW)).toBeNull()
    expect(campaignGroup(t({ name: "Demo chemist" }), NOW)).toBeNull()
    expect(campaignGroup(t({ name: "Contest Pharmacy" }), NOW)).toBe("extend")
    expect(campaignGroup(t({ optedOut: true }), NOW)).toBeNull()
  })
})

describe("campaignEmail", () => {
  const base = { appUrl: "https://pharmatrack.co.ke", firstName: "Faith", pharmacy: "Uzima <Chemist>", stage: "no_stock" as const, replyTo: "kimutaiwycliff90@gmail.com" }
  it("offers 14 more days and the reply address in the extend email", () => {
    const m = campaignEmail("extend", base)
    expect(m.html).toContain("another 14 days free")
    expect(m.html).toContain("mailto:kimutaiwycliff90@gmail.com")
    expect(m.html).toContain("https://pharmatrack.co.ke/getting-started")
  })
  it("says how far along a paying pharmacy is", () => {
    expect(campaignEmail("nudge", base).html).toContain("3 of 5 steps in")
  })
  it("escapes names and always includes the STOP line", () => {
    for (const g of ["extend", "nudge", "selling"] as const) {
      const m = campaignEmail(g, base)
      expect(m.html).toContain("Uzima &lt;Chemist&gt;")
      expect(m.html).not.toContain("<Chemist>")
      expect(m.html).toContain("Reply STOP")
    }
  })
  it("falls back to 'there' without a first name", () => {
    expect(campaignEmail("extend", { ...base, firstName: "" }).html).toContain("Hi there,")
  })
})
