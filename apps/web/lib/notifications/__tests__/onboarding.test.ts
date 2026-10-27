import { describe, expect, it } from "vitest"
import { setupProgress, type SetupFacts } from "@pharmatrack/core"
import { activationEmail, activationEmailDue } from "@/lib/notifications/activation"

const empty: SetupFacts = { products: 0, priced: 0, stocked: 0, sales: 0, staff: 1, mpesa: false, receiptLogo: false, devices: 0 }

describe("setupProgress", () => {
  it("starts a new pharmacy at 1 of 5 with Add products next", () => {
    const p = setupProgress(empty)
    expect(p.coreDone).toBe(1)
    expect(p.coreTotal).toBe(5)
    expect(p.next).toBe("products")
    expect(p.ready).toBe(false)
    expect(p.minutesLeft).toBe(14)
  })
  it("keeps Set prices open while any product is unpriced", () => {
    const p = setupProgress({ ...empty, products: 10, priced: 7 })
    expect(p.steps.find((s) => s.key === "products")!.done).toBe(true)
    expect(p.steps.find((s) => s.key === "prices")!.done).toBe(false)
    expect(p.steps.find((s) => s.key === "prices")!.detail).toBe("3 products still need a price")
    expect(p.next).toBe("prices")
  })
  it("moves to stock, then the first sale", () => {
    expect(setupProgress({ ...empty, products: 4, priced: 4 }).next).toBe("stock")
    expect(setupProgress({ ...empty, products: 4, priced: 4, stocked: 2 }).next).toBe("first_sale")
  })
  it("is ready after the first sale and then suggests the optional steps", () => {
    const p = setupProgress({ ...empty, products: 4, priced: 4, stocked: 2, sales: 1 })
    expect(p.ready).toBe(true)
    expect(p.coreDone).toBe(5)
    expect(p.minutesLeft).toBe(0)
    expect(p.next).toBe("staff")
  })
  it("ticks optional steps from real data", () => {
    const p = setupProgress({ ...empty, products: 1, priced: 1, stocked: 1, sales: 1, staff: 3, mpesa: true, receiptLogo: true, devices: 2 })
    expect(p.steps.every((s) => s.done)).toBe(true)
    expect(p.next).toBeNull()
  })
})

describe("activationEmailDue", () => {
  const none = new Set<never>()
  it("welcomes within the first two days", () => {
    expect(activationEmailDue({ ageHours: 0.2, stage: "no_products", trialing: true, sent: none })).toBeNull()
    expect(activationEmailDue({ ageHours: 1, stage: "no_products", trialing: true, sent: none })).toBe("welcome")
  })
  it("nudges about products on day 2 only if they have none (or no prices)", () => {
    const sent = new Set(["welcome"] as const)
    expect(activationEmailDue({ ageHours: 30, stage: "no_products", trialing: true, sent })).toBe("no_products")
    expect(activationEmailDue({ ageHours: 30, stage: "no_stock", trialing: true, sent })).toBeNull()
  })
  it("nudges toward the first sale from day 3 if not selling", () => {
    const sent = new Set(["welcome", "no_products"] as const)
    expect(activationEmailDue({ ageHours: 80, stage: "no_stock", trialing: true, sent })).toBe("no_sale")
    expect(activationEmailDue({ ageHours: 80, stage: "selling", trialing: true, sent })).toBeNull()
  })
  it("sends the halfway note from day 7, once", () => {
    expect(activationEmailDue({ ageHours: 170, stage: "selling", trialing: true, sent: new Set(["welcome"] as const) })).toBe("halfway")
    expect(activationEmailDue({ ageHours: 170, stage: "selling", trialing: true, sent: new Set(["welcome", "halfway"] as const) })).toBeNull()
  })
  it("never emails paying, cancelled or older pharmacies", () => {
    expect(activationEmailDue({ ageHours: 1, stage: "no_products", trialing: false, sent: none })).toBeNull()
    expect(activationEmailDue({ ageHours: 15 * 24, stage: "no_products", trialing: true, sent: none })).toBeNull()
  })
})

describe("activationEmail", () => {
  const base = { appUrl: "https://pharmatrack.co.ke", firstName: "Faith", pharmacy: "Uzima <Chemist>", trialDaysLeft: 7, coreTotal: 5 }
  it("links each email to the step they're stuck on", () => {
    expect(activationEmail("no_products", { ...base, stage: "no_products", coreDone: 1 }).html).toContain("/products?quickstart=1")
    expect(activationEmail("no_sale", { ...base, stage: "no_stock", coreDone: 3 }).html).toContain("/inventory/receive?tour=1")
    expect(activationEmail("no_sale", { ...base, stage: "no_stock", coreDone: 3 }).subject).toBe("You're 3 of 5 steps from selling on PharmaTrack")
  })
  it("escapes the pharmacy name", () => {
    const m = activationEmail("welcome", { ...base, stage: "no_products", coreDone: 1 })
    expect(m.html).toContain("Uzima &lt;Chemist&gt;")
    expect(m.html).not.toContain("<Chemist>")
  })
  it("counts down the trial in the halfway email", () => {
    expect(activationEmail("halfway", { ...base, stage: "selling", coreDone: 5, trialDaysLeft: 1 }).subject).toBe("1 day left in your PharmaTrack trial")
  })
})
