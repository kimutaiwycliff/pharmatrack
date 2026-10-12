import { describe, expect, it } from "vitest"
import { baseQtyLabel, mergeSaleItems, paymentLabel, saleDetailToReceipt, saleStatusBadge, type SaleDetail } from "../receiptMapping"

const detail = (over: Partial<SaleDetail["sale"]> = {}, items?: SaleDetail["items"]): SaleDetail => ({
  sale: {
    receipt_number: "RCP-261012-000007",
    created_at: "2026-10-12T08:15:00.000Z",
    status: "completed",
    payment_method: "cash",
    subtotal: 190,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: 190,
    amount_tendered: 200,
    change_given: 10,
    mpesa_reference: null,
    cashier_name: "Jane",
    org_name: "Afya Ltd",
    branch_name: "Afya Westlands",
    ...over,
  },
  items: items ?? [
    // FEFO split one cart line across two batches.
    { product_id: "p1", product_name: "Paracetamol", product_strength: "500mg", quantity: 6, unit_price: 5, discount_percent: 0, line_total: 30, base_unit: "tablet" },
    { product_id: "p1", product_name: "Paracetamol", product_strength: "500mg", quantity: 4, unit_price: 5, discount_percent: 0, line_total: 20, base_unit: "tablet" },
    { product_id: "p2", product_name: "Amoxil", product_strength: null, quantity: 1, unit_price: 150, discount_percent: 10, line_total: 135, base_unit: "bottle" },
    { product_id: "p3", product_name: "ORS", product_strength: null, quantity: 1, unit_price: 5, discount_percent: 0, line_total: 5, base_unit: "sachet" },
  ],
})

describe("saleDetailToReceipt", () => {
  it("merges FEFO batch rows and keeps line discounts", () => {
    const r = saleDetailToReceipt(detail())
    expect(r.lines).toHaveLength(3)
    expect(r.lines[0]).toEqual({ name: "Paracetamol 500mg", qtyLabel: "10 tablets", totalCents: 5000, discountCents: 0 })
    expect(r.lines[1]).toEqual({ name: "Amoxil", qtyLabel: "1 bottle", totalCents: 13500, discountCents: 1500 })
  })
  it("totals: total is the server's, subtotal adds the discounts back", () => {
    const r = saleDetailToReceipt(detail())
    expect(r.totalCents).toBe(19000)
    expect(r.discountCents).toBe(1500)
    expect(r.subtotalCents).toBe(20500)
  })
  it("cash sale shows tendered and change; shop is the branch", () => {
    const r = saleDetailToReceipt(detail())
    expect(r).toMatchObject({ shopName: "Afya Westlands", paymentLabel: "Cash", paidCents: 20000, changeCents: 1000, cashier: "Jane" })
    expect(r.soldAtMs).toBe(Date.parse("2026-10-12T08:15:00.000Z"))
  })
  it("M-Pesa pays the total with the reference", () => {
    const r = saleDetailToReceipt(detail({ payment_method: "mpesa", amount_tendered: 190, change_given: 0, mpesa_reference: "QWE123" }))
    expect(r).toMatchObject({ paymentLabel: "M-Pesa", paidCents: 19000, changeCents: 0, mpesaReference: "QWE123" })
  })
  it("split names the cash part", () => {
    const r = saleDetailToReceipt(detail({ payment_method: "split", amount_tendered: 100, change_given: 0 }))
    expect(r.paymentLabel).toBe("Cash KES 100.00 + M-Pesa")
    expect(r.paidCents).toBe(19000)
  })
  it("Offline Edition detail (no tendered/change/org) still maps", () => {
    const d = detail()
    delete d.sale.amount_tendered
    delete d.sale.change_given
    delete d.sale.org_name
    const r = saleDetailToReceipt({ ...d, sale: { ...d.sale, branch_name: null } }, "PharmaTrack")
    expect(r).toMatchObject({ shopName: "PharmaTrack", paidCents: 19000, changeCents: 0 })
  })
  it("a sale-level discount is added to the line discounts", () => {
    const r = saleDetailToReceipt(detail({ discount_amount: 10, total_amount: 180 }))
    expect(r.discountCents).toBe(2500)
    expect(r.subtotalCents).toBe(20500)
  })
})

describe("helpers", () => {
  it("mergeSaleItems keeps different prices apart", () => {
    const merged = mergeSaleItems([
      { product_name: "A", product_strength: null, quantity: 1, unit_price: 5, discount_percent: 0, line_total: 5, base_unit: "tab" },
      { product_name: "A", product_strength: null, quantity: 1, unit_price: 6, discount_percent: 0, line_total: 6, base_unit: "tab" },
    ])
    expect(merged).toHaveLength(2)
  })
  it("baseQtyLabel pluralises", () => {
    expect(baseQtyLabel(1, "tablet")).toBe("1 tablet")
    expect(baseQtyLabel(3, "tablet")).toBe("3 tablets")
    expect(baseQtyLabel(2, null)).toBe("2 units")
  })
  it("paymentLabel", () => {
    expect(paymentLabel("mpesa")).toBe("M-Pesa")
    expect(paymentLabel("card")).toBe("Card")
  })
  it("saleStatusBadge", () => {
    expect(saleStatusBadge("completed")).toBeNull()
    expect(saleStatusBadge("voided")).toEqual({ status: "danger", label: "Voided" })
    expect(saleStatusBadge("refunded")).toEqual({ status: "warning", label: "Refunded" })
    expect(saleStatusBadge("on_hold")).toEqual({ status: "neutral", label: "On hold" })
  })
})
