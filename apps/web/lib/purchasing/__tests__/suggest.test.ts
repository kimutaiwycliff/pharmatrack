import { describe, it, expect } from "vitest"
import { suggestRestock, formatPoNumber } from "../suggest"

const base = { stockOnHand: 50, reorderLevel: 10, soldInWindow: 0, windowDays: 30, coverDays: 30, onOrder: 0, unitsPerPack: 10 }

describe("suggestRestock", () => {
  it("skips healthy, slow-moving stock", () => {
    expect(suggestRestock(base).packs).toBe(0)
  })

  it("orders demand + safety buffer for a low-stock item, rounded up to packs", () => {
    // 3/day × 30 days = 90, + reorder 10 = 100 target; on hand 8 → need 92 → 10 packs of 10
    const s = suggestRestock({ ...base, stockOnHand: 8, soldInWindow: 90 })
    expect(s.reason).toBe("low_stock")
    expect(s.needUnits).toBe(92)
    expect(s.packs).toBe(10)
  })

  it("flags out-of-stock and orders at least one pack even with no sales history", () => {
    const s = suggestRestock({ ...base, stockOnHand: 0 })
    expect(s.reason).toBe("out_of_stock")
    expect(s.packs).toBe(1)
  })

  it("suggests fast movers that won't last the cover period even above reorder level", () => {
    const s = suggestRestock({ ...base, stockOnHand: 40, soldInWindow: 60 }) // 2/day → 60 needed
    expect(s.reason).toBe("demand")
    expect(s.packs).toBe(3) // target 70 − 40 = 30 → 3 packs
  })

  it("subtracts stock already on order", () => {
    const s = suggestRestock({ ...base, stockOnHand: 5, soldInWindow: 30, onOrder: 100 })
    expect(s.packs).toBe(0)
  })
})

describe("formatPoNumber", () => {
  it("pads the sequence and stamps year-month", () => {
    expect(formatPoNumber(42, new Date("2026-10-09T10:00:00+03:00"))).toBe("PO-2610-00042")
  })
})
