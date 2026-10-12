import { describe, expect, it } from "vitest"
import { buildReceiptData, nairobiDateTime, qtyLabel, receiptHtml, receiptText, whatsappUrl, type ReceiptData } from "../receipt"

const r: ReceiptData = {
  shopName: "Afya <Bora>",
  receiptNumber: "D01-261012-0007",
  soldAtMs: Date.parse("2026-10-12T20:30:00Z"),
  cashier: "Jane",
  lines: [{ name: "Paracetamol 500mg", qtyLabel: "2 × Strip of 10", totalCents: 11_000, discountCents: 0 }],
  subtotalCents: 11_000,
  discountCents: 0,
  totalCents: 11_000,
  paymentLabel: "Cash",
  paidCents: 20_000,
  changeCents: 9_000,
  mpesaReference: null,
}

describe("receipt", () => {
  it("uses Nairobi time", () => {
    expect(nairobiDateTime(r.soldAtMs)).toBe("12/10/2026 23:30")
  })
  it("text receipt lists items, total and change", () => {
    const t = receiptText(r)
    expect(t).toContain("Receipt D01-261012-0007")
    expect(t).toContain("Paracetamol 500mg — 2 × Strip of 10: KES 110.00")
    expect(t).toContain("*Total: KES 110.00*")
    expect(t).toContain("Change: KES 90.00")
    expect(t).not.toContain("Discount")
  })
  it("escapes HTML", () => {
    expect(receiptHtml(r)).toContain("Afya &lt;Bora&gt;")
  })
  it("WhatsApp links", () => {
    expect(whatsappUrl("hi")).toBe("whatsapp://send?text=hi")
    expect(whatsappUrl("hi there", "0712 345 678")).toBe("https://wa.me/254712345678?text=hi%20there")
    expect(whatsappUrl("hi", "12345")).toBeNull()
  })
})

describe("buildReceiptData", () => {
  const base = {
    productId: "p1",
    productName: "Paracetamol",
    productStrength: "500mg",
    unitPrice: 200,
    discountPercent: 0,
    baseUnit: "tablet",
    isControlled: false,
    requiresPrescription: false,
    stockOnHand: 100,
    maxDiscountPercent: null,
  }
  const strip = { packSizeId: "s", label: "Strip of 10", unitCount: 10, priceCents: 1_500 }

  it("labels base-unit and pack lines", () => {
    expect(qtyLabel({ quantity: 1, baseUnit: "tablet", sellUnit: null })).toBe("1 tablet")
    expect(qtyLabel({ quantity: 3, baseUnit: "tablet", sellUnit: null })).toBe("3 tablets")
    expect(qtyLabel({ quantity: 20, baseUnit: "tablet", sellUnit: strip })).toBe("2 × Strip of 10")
  })

  it("snapshots lines and totals from the cart maths", () => {
    const d = buildReceiptData(
      [
        { ...base, quantity: 3, sellUnit: null },
        { ...base, productId: "p2", quantity: 20, sellUnit: strip, discountPercent: 10 },
      ],
      { shopName: "Shop", receiptNumber: "R1", soldAtMs: 0, cashier: "Ann" },
      { label: "Cash", paidCents: 4_000, changeCents: 700, mpesaReference: null },
    )
    expect(d.lines).toEqual([
      { name: "Paracetamol 500mg", qtyLabel: "3 tablets", totalCents: 600, discountCents: 0 },
      { name: "Paracetamol 500mg", qtyLabel: "2 × Strip of 10", totalCents: 2_700, discountCents: 300 },
    ])
    expect(d.subtotalCents).toBe(3_600)
    expect(d.discountCents).toBe(300)
    expect(d.totalCents).toBe(3_300)
    expect(d.changeCents).toBe(700)
  })
})
