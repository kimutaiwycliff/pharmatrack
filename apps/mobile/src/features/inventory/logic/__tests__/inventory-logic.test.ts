import { describe, expect, it } from "vitest"
import { expiryInfo } from "../expiry"
import { sortFefo, totalRemaining } from "../fefo"
import { buildReceiveBody, unitsPreview, type ReceiveForm } from "../receive"
import { defaultQuantityText, planAdjustment } from "../adjust"
import { parseStatusParam, visibleBadges } from "../status"

// 10:00 in Nairobi on 1 Jun 2026.
const NOW = new Date("2026-06-01T07:00:00Z")

describe("expiryInfo", () => {
  it("buckets expired / soon / ok", () => {
    expect(expiryInfo("2026-05-31", NOW)).toMatchObject({ kind: "expired", status: "danger", label: "Expired" })
    expect(expiryInfo("2026-06-01", NOW)).toMatchObject({ kind: "soon", days: 0, label: "Expires today" })
    expect(expiryInfo("2026-06-02", NOW)).toMatchObject({ kind: "soon", days: 1, label: "Expires tomorrow" })
    expect(expiryInfo("2026-08-30", NOW)).toMatchObject({ kind: "soon", days: 90, status: "warning", label: "Expires in 90 days" })
    expect(expiryInfo("2026-08-31", NOW)).toMatchObject({ kind: "ok", days: 91, status: "ok" })
  })
  it("accepts timestamps and handles missing dates", () => {
    expect(expiryInfo("2026-06-11T00:00:00.000Z", NOW).days).toBe(10)
    expect(expiryInfo(null, NOW).kind).toBe("unknown")
    expect(expiryInfo("garbage", NOW).kind).toBe("unknown")
  })
})

describe("sortFefo", () => {
  it("orders earliest expiry first, undated last, ties by receipt", () => {
    const rows = [
      { batch_number: "C", expiry_date: "2027-01-01", received_at: "2026-01-01" },
      { batch_number: "X", expiry_date: null },
      { batch_number: "B", expiry_date: "2026-07-01", received_at: "2026-03-01" },
      { batch_number: "A", expiry_date: "2026-07-01", received_at: "2026-02-01" },
    ]
    expect(sortFefo(rows).map((r) => r.batch_number)).toEqual(["A", "B", "C", "X"])
    expect(rows[0]!.batch_number).toBe("C") // input untouched
  })
  it("sums remaining units", () => {
    expect(totalRemaining([{ quantity_remaining: 3 }, { quantity_remaining: 7 }])).toBe(10)
  })
})

describe("buildReceiveBody", () => {
  const base: ReceiveForm = {
    productId: "p1",
    branchId: "b1",
    batchNumber: " BN42 ",
    expiry: "2027-03-01",
    packsText: "3",
    unitsPerPack: 100,
    costPerPackText: "250",
    includeCost: true,
    supplierId: null,
  }

  it("converts packs and pack cost to base units like web", () => {
    const r = buildReceiveBody(base, NOW)
    expect(r).toEqual({
      ok: true,
      body: { product_id: "p1", branch_id: "b1", batch_number: "BN42", expiry_date: "2027-03-01", quantity_received: 300, cost_price: 2.5 },
    })
  })

  it("rounds cost per unit to the cent and passes the supplier", () => {
    const r = buildReceiveBody({ ...base, costPerPackText: "100", unitsPerPack: 3, supplierId: "s1" }, NOW)
    expect(r.ok && r.body.cost_price).toBe(33.33)
    expect(r.ok && r.body.supplier_id).toBe("s1")
  })

  it("omits cost when blank or hidden", () => {
    const blank = buildReceiveBody({ ...base, costPerPackText: "" }, NOW)
    expect(blank.ok && "cost_price" in blank.body).toBe(false)
    const hidden = buildReceiveBody({ ...base, includeCost: false, costPerPackText: "abc" }, NOW)
    expect(hidden.ok).toBe(true)
  })

  it("validates every field", () => {
    const r = buildReceiveBody({ ...base, productId: null, batchNumber: "", expiry: "2026-06-01", packsText: "1.5", costPerPackText: "x" }, NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["batchNumber", "cost", "expiry", "packs", "product"])
      expect(r.errors.expiry).toMatch(/future/)
    }
    const noDate = buildReceiveBody({ ...base, expiry: "" }, NOW)
    expect(!noDate.ok && noDate.errors.expiry).toBe("Choose the expiry date")
  })

  it("previews base units", () => {
    expect(unitsPreview("2", 100, "tablet")).toBe("= 200 tablets")
    expect(unitsPreview("1", 1, "box")).toBe("= 1 box")
    expect(unitsPreview("3", 1, "box")).toBe("= 3 boxes")
    expect(unitsPreview("", 10, "tablet")).toBeNull()
  })
})

describe("planAdjustment", () => {
  it("re-count sets the quantity", () => {
    expect(planAdjustment(10, "count_correction", "7")).toMatchObject({ valid: true, newRemaining: 7, delta: -3, body: { mode: "set", value: 7 } })
    expect(planAdjustment(10, "count_correction", "10")).toMatchObject({ valid: false, error: "That's already the quantity" })
  })
  it("write-offs subtract, returns add", () => {
    expect(planAdjustment(10, "damage", "4")).toMatchObject({ valid: true, newRemaining: 6, body: { mode: "delta", value: -4, reason: "damage" } })
    expect(planAdjustment(10, "return", "2")).toMatchObject({ valid: true, newRemaining: 12, body: { mode: "delta", value: 2 } })
  })
  it("blocks going below zero and bad input", () => {
    expect(planAdjustment(3, "theft_loss", "5")).toMatchObject({ valid: false, newRemaining: -2 })
    expect(planAdjustment(3, "expiry", "-1")).toMatchObject({ valid: false, error: "Enter a whole number" })
    expect(planAdjustment(3, "expiry", "")).toMatchObject({ valid: false, error: null })
  })
  it("prefills set-mode reasons with the current quantity", () => {
    expect(defaultQuantityText("other", 12)).toBe("12")
    expect(defaultQuantityText("damage", 12)).toBe("")
  })
})

describe("status", () => {
  it("parses the route param", () => {
    expect(parseStatusParam("low_stock")).toBe("low_stock")
    expect(parseStatusParam(["expiring"])).toBe("expiring")
    expect(parseStatusParam("ok")).toBe("all")
    expect(parseStatusParam(undefined)).toBe("all")
  })
  it("hides the ok badge", () => {
    expect(visibleBadges(["ok", "controlled"])).toEqual(["controlled"])
  })
})
