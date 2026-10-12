import { describe, expect, it } from "vitest"
import {
  buildSalePayload, cashCollectedCents, quantitiesByProduct, SalePayloadError, sellableQty,
  type BuildSaleArgs, type CartLineInput,
} from "../payload"
import { formatReceiptNumber, nextReceiptSeq, RECEIPT_RE, sanitizeDeviceCode } from "../receipt"

const SOLD = new Date("2026-10-12T23:30:00+03:00").getTime()

const line = (over: Partial<CartLineInput> = {}): CartLineInput => ({
  productId: "11111111-1111-4111-8111-111111111111",
  productName: "Paracetamol",
  productStrength: "500mg",
  baseUnit: "tablet",
  quantity: 3,
  unitPriceCents: 1050,
  discountPercent: 0,
  isControlled: false,
  ...over,
})

const args = (over: Partial<BuildSaleArgs> = {}): BuildSaleArgs => ({
  clientId: "22222222-2222-4222-8222-222222222222",
  receiptNumber: "D01-261012-0001",
  cashierId: "u1",
  shiftClientId: "sh-abc12345",
  soldAtMs: SOLD,
  lines: [line()],
  payment: { method: "cash", tenderedCents: 5000 },
  ...over,
})

describe("receipt numbers", () => {
  it("uses the Nairobi date, not UTC", () => {
    // 23:30 Nairobi on the 12th is 20:30 UTC — still the 12th; 00:30 Nairobi on the 13th is the 12th in UTC.
    expect(formatReceiptNumber("D01", SOLD, 7)).toBe("D01-261012-0007")
    const after = new Date("2026-10-13T00:30:00+03:00").getTime()
    expect(formatReceiptNumber("D01", after, 1)).toBe("D01-261013-0001")
  })
  it("matches the server regex and sanitises codes", () => {
    expect(RECEIPT_RE.test(formatReceiptNumber("d-01", SOLD, 12345))).toBe(true)
    expect(sanitizeDeviceCode("d-01")).toBe("D01")
    expect(sanitizeDeviceCode("")).toBe("D00")
    expect(sanitizeDeviceCode("ABCDEFGH")).toBe("ABCDEF")
  })
  it("counter restarts each day", () => {
    expect(nextReceiptSeq(null, "261012")).toBe(1)
    expect(nextReceiptSeq({ dateKey: "261012", lastSeq: 4 }, "261012")).toBe(5)
    expect(nextReceiptSeq({ dateKey: "261011", lastSeq: 40 }, "261012")).toBe(1)
  })
  it("rejects bad sequences", () => {
    expect(() => formatReceiptNumber("D01", SOLD, 0)).toThrow()
  })
})

describe("buildSalePayload", () => {
  it("builds a cash sale in decimal KES", () => {
    const p = buildSalePayload(args())
    expect(p.type).toBe("sale")
    expect(p.items[0]).toMatchObject({ quantity: 3, unit_price: 10.5, line_total: 31.5, discount_percent: 0, sell_unit: null })
    expect(p.total_amount).toBe(31.5)
    expect(p.amount_tendered).toBe(50)
    expect(p.change_given).toBe(18.5)
    expect(p.payment_method).toBe("cash")
    expect(p.mpesa_verified).toBe(true)
    expect(p.sold_at).toBe("2026-10-12T20:30:00.000Z")
    expect(p.discount_amount).toBe(0)
    expect(p.override_client_id).toBeNull()
  })

  it("nets per-line discounts (half-up) into line_total and total", () => {
    const p = buildSalePayload(args({
      lines: [line({ quantity: 1, unitPriceCents: 999, discountPercent: 5 }), line({ productId: "x", quantity: 2, unitPriceCents: 100 })],
      payment: { method: "cash", tenderedCents: 2000 },
    }))
    // 999 * 5% = 49.95 → 50 cents off → 949
    expect(p.items[0]!.line_total).toBe(9.49)
    expect(p.items[0]!.unit_price).toBe(9.99)
    expect(p.total_amount).toBe(11.49)
  })

  it("refuses cash that doesn't cover the total", () => {
    expect(() => buildSalePayload(args({ payment: { method: "cash", tenderedCents: 100 } }))).toThrow(SalePayloadError)
  })

  it("records an offline till/paybill M-Pesa sale as unverified", () => {
    const p = buildSalePayload(args({ payment: { method: "mpesa", reference: " QWE123RTY0 ", verified: false } }))
    expect(p.payment_method).toBe("mpesa")
    expect(p.mpesa_reference).toBe("QWE123RTY0")
    expect(p.mpesa_verified).toBe(false)
    expect(p.amount_tendered).toBe(31.5)
    expect(p.change_given).toBe(0)
  })

  it("validates split sums", () => {
    const ok = buildSalePayload(args({ payment: { method: "split", cashCents: 1500, mpesaCents: 1650, reference: null, verified: true } }))
    expect(ok.cash_amount).toBe(15)
    expect(ok.mpesa_amount).toBe(16.5)
    expect(() => buildSalePayload(args({ payment: { method: "split", cashCents: 100, mpesaCents: 100, reference: null, verified: true } }))).toThrow()
  })

  it("carries the override id", () => {
    expect(buildSalePayload(args({ overrideClientId: "ov-1234567890" })).override_client_id).toBe("ov-1234567890")
  })

  it("rejects an empty cart or bad quantities", () => {
    expect(() => buildSalePayload(args({ lines: [] }))).toThrow()
    expect(() => buildSalePayload(args({ lines: [line({ quantity: 0 })] }))).toThrow()
  })
})

describe("pack sales (sell_unit)", () => {
  const strip = { packSizeId: "33333333-3333-4333-8333-333333333333", unitCount: 10, packPriceCents: 5500 }

  it("sends sell_unit, base-unit quantity and the per-base-unit price", () => {
    const p = buildSalePayload(args({
      lines: [line({ quantity: 20, unitPriceCents: 600, sellUnit: strip })],
      payment: { method: "cash", tenderedCents: 20000 },
    }))
    expect(p.items[0]).toMatchObject({
      quantity: 20,
      unit_price: 5.5,
      line_total: 110,
      sell_unit: { pack_size_id: strip.packSizeId, unit_count: 10 },
    })
    expect(p.total_amount).toBe(110)
    expect(p.change_given).toBe(90)
  })

  it("prices whole packs, not rounded unit prices", () => {
    // KES 100 for 3 → 33.333… per unit; two packs must still be exactly 200.
    const three = { packSizeId: "p3", unitCount: 3, packPriceCents: 10000 }
    const p = buildSalePayload(args({
      lines: [line({ quantity: 6, sellUnit: three })],
      payment: { method: "cash", tenderedCents: 20000 },
    }))
    expect(p.items[0]!.line_total).toBe(200)
    expect(p.items[0]!.unit_price).toBe(33.33)
  })

  it("applies the line discount to the pack total", () => {
    const p = buildSalePayload(args({
      lines: [line({ quantity: 10, discountPercent: 10, sellUnit: strip })],
      payment: { method: "cash", tenderedCents: 5000 },
    }))
    expect(p.items[0]!.line_total).toBe(49.5)
    expect(p.items[0]!.unit_price).toBe(5.5)
  })

  it("rejects part packs", () => {
    expect(() => buildSalePayload(args({ lines: [line({ quantity: 15, sellUnit: strip })], payment: { method: "cash", tenderedCents: 99999 } }))).toThrow(SalePayloadError)
  })
})

describe("helpers", () => {
  it("cash collected per payment method", () => {
    expect(cashCollectedCents({ method: "cash", tenderedCents: 900 }, 500)).toBe(500)
    expect(cashCollectedCents({ method: "split", cashCents: 200, mpesaCents: 300, reference: null, verified: true }, 500)).toBe(200)
    expect(cashCollectedCents({ method: "mpesa", reference: null, verified: true }, 500)).toBe(0)
  })
  it("sums quantities by product", () => {
    const p = buildSalePayload(args())
    expect(quantitiesByProduct([p, p]).get(line().productId)).toBe(6)
  })
  it("sellable is the smaller of allowance and stock", () => {
    expect(sellableQty(5, 3)).toBe(3)
    expect(sellableQty(2, 30)).toBe(2)
    expect(sellableQty(null, 30)).toBe(0)
    expect(sellableQty(4, -2)).toBe(0)
  })
})
