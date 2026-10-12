import { describe, expect, it } from "vitest"
import { buildSalePayload } from "../../../../lib/sync/core/payload"
import {
  baseQtyInCart, cartTotals, clampDiscount, lineCap, lineKey, maxSellQty, needsPrescriptionCheck, remainingFor, sellQty, toCartLineInput, type CartItem,
} from "../cart"

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productId: "11111111-1111-4111-8111-111111111111",
  productName: "Amoxicillin",
  productStrength: "500mg",
  quantity: 1,
  unitPrice: 1_000,
  discountPercent: 0,
  baseUnit: "capsule",
  isControlled: false,
  requiresPrescription: false,
  stockOnHand: 50,
  maxDiscountPercent: null,
  sellUnit: null,
  ...over,
})

const strip = { packSizeId: "33333333-3333-4333-8333-333333333333", label: "Strip of 10", unitCount: 10, priceCents: 9_000 }

describe("cart totals", () => {
  it("sums lines with per-line discounts (half-up per line)", () => {
    const t = cartTotals([
      item({ quantity: 3, unitPrice: 999, discountPercent: 5 }), // 2997 → 149.85 → 150 off
      item({ productId: "b", quantity: 2, unitPrice: 2_500 }),
    ])
    expect(t).toEqual({ subtotal: 7_997, discount: 150, total: 7_847, count: 5 })
  })

  it("prices pack lines by the pack and counts packs", () => {
    const t = cartTotals([item({ quantity: 20, sellUnit: strip, discountPercent: 10 })])
    expect(t).toEqual({ subtotal: 18_000, discount: 1_800, total: 16_200, count: 2 })
  })

  it("empty cart", () => {
    expect(cartTotals([])).toEqual({ subtotal: 0, discount: 0, total: 0, count: 0 })
  })
})

describe("pack pricing → payload", () => {
  it("sends sell_unit, base-unit quantity and per-base-unit price", () => {
    const line = item({ quantity: 30, sellUnit: strip })
    expect(sellQty(line)).toBe(3)
    const p = buildSalePayload({
      clientId: "22222222-2222-4222-8222-222222222222",
      receiptNumber: "D01-261012-0001",
      cashierId: "u1",
      shiftClientId: "sh-12345678",
      soldAtMs: Date.UTC(2026, 9, 12),
      lines: [toCartLineInput(line)],
      payment: { method: "cash", tenderedCents: 30_000 },
    })
    expect(p.items[0]).toMatchObject({
      quantity: 30,
      unit_price: 9,
      line_total: 270,
      sell_unit: { pack_size_id: strip.packSizeId, unit_count: 10 },
    })
    expect(p.total_amount).toBe(cartTotals([line]).total / 100)
  })

  it("base-unit lines send sell_unit null", () => {
    expect(toCartLineInput(item()).sellUnit).toBeNull()
  })
})

describe("limits", () => {
  it("max sell quantity is whole packs within the allowance", () => {
    expect(maxSellQty(item({ stockOnHand: 25, sellUnit: strip }))).toBe(2)
    expect(maxSellQty(item({ stockOnHand: 25 }))).toBe(25)
  })
  it("discount clamps to the product cap", () => {
    expect(clampDiscount(15, 10)).toBe(10)
    expect(clampDiscount(-3, null)).toBe(0)
    expect(clampDiscount(120, null)).toBe(100)
    expect(clampDiscount(Number.NaN, 5)).toBe(0)
  })
  it("prescription check", () => {
    expect(needsPrescriptionCheck([item()])).toEqual({ required: false, controlled: false })
    expect(needsPrescriptionCheck([item({ requiresPrescription: true })])).toEqual({ required: true, controlled: false })
    expect(needsPrescriptionCheck([item({ isControlled: true })])).toEqual({ required: true, controlled: true })
  })
})

describe("lines per product", () => {
  it("keys lines by product + pack and shares the cap", () => {
    const loose = item({ quantity: 5, stockOnHand: 30 })
    const packs = item({ quantity: 20, stockOnHand: 30, sellUnit: strip })
    expect(lineKey(loose)).not.toBe(lineKey(packs))
    const items = [loose, packs]
    expect(baseQtyInCart(items, loose.productId)).toBe(25)
    expect(baseQtyInCart(items, loose.productId, lineKey(packs))).toBe(5)
    // 30 on hand − 5 loose = 25 free → 2 whole strips
    expect(lineCap(items, packs)).toBe(2)
    // 30 − 20 in strips = 10 loose max
    expect(lineCap(items, loose)).toBe(10)
    expect(remainingFor(items, loose.productId, 30)).toBe(5)
  })
})
