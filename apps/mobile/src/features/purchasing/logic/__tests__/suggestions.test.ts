import { describe, expect, it } from "vitest"
import { buildDraftOrderBody, groupSuggestions, NO_SUPPLIER, suggestionHint } from "../suggestions"
import { canCancelStatus, canReceiveStatus, poBadgeStatus } from "../status"
import { kesToCents, packName } from "../types"
import type { RestockSuggestion } from "../types"

function sug(over: Partial<RestockSuggestion>): RestockSuggestion {
  return {
    product_id: "p", name: "Item", strength: null, base_unit: "tablet", pack_label: null, units_per_pack: 10,
    stock_on_hand: 4, reorder_level: 10, sold: 30, avg_daily: 1, on_order: 0, suggested_packs: 2, reason: "low_stock",
    cost_per_pack: 100, supplier_id: null, supplier_name: null, ...over,
  }
}

describe("groupSuggestions", () => {
  it("groups by supplier, named A→Z first and 'No supplier yet' last, with a cents budget", () => {
    const groups = groupSuggestions([
      sug({ product_id: "a", supplier_id: null }),
      sug({ product_id: "b", supplier_id: "s2", supplier_name: "Zeta", cost_per_pack: 12.5, suggested_packs: 3 }),
      sug({ product_id: "c", supplier_id: "s1", supplier_name: "Alpha", cost_per_pack: null }),
      sug({ product_id: "d", supplier_id: "s2", supplier_name: "Zeta", cost_per_pack: 0.1, suggested_packs: 3 }),
    ])
    expect(groups.map((g) => g.supplierName)).toEqual(["Alpha", "Zeta", "No supplier yet"])
    expect(groups[2]!.key).toBe(NO_SUPPLIER)
    expect(groups[0]!.totalCents).toBeNull()
    expect(groups[1]!.totalCents).toBe(3 * 1250 + 3 * 10)
  })
})

describe("buildDraftOrderBody", () => {
  it("matches POST /api/purchase-orders and only sends cost when visible", () => {
    const [g] = groupSuggestions([sug({ product_id: "x", supplier_id: "s1", supplier_name: "A", pack_label: "Strip" })])
    expect(buildDraftOrderBody("br1", g!, true)).toEqual({
      branch_id: "br1", supplier_id: "s1",
      items: [{ product_id: "x", quantity_ordered: 2, units_per_pack: 10, pack_label: "Strip", unit_cost: 100 }],
    })
    expect(buildDraftOrderBody("br1", g!, false).items[0]).not.toHaveProperty("unit_cost")
  })
})

describe("helpers", () => {
  it("hint, status rules, money and pack names", () => {
    expect(suggestionHint(sug({ avg_daily: 3.5, on_order: 20 }))).toBe("4 tablets on hand · sells 3.5/day · 20 on order")
    expect(suggestionHint(sug({ avg_daily: 0 }))).toBe("4 tablets on hand · no recent sales")
    expect(canReceiveStatus("sent")).toBe(true)
    expect(canReceiveStatus("received")).toBe(false)
    expect(canCancelStatus("draft")).toBe(false)
    expect(poBadgeStatus("cancelled")).toBe("danger")
    expect(kesToCents(1200.5)).toBe(120050)
    expect(kesToCents("0.1")).toBe(10)
    expect(kesToCents(null)).toBeNull()
    expect(packName({ pack_label: null, units_per_pack: 10 })).toBe("Pack of 10")
    expect(packName({ pack_label: null, units_per_pack: 1, base_unit: "bottle" })).toBe("bottle")
  })
})
