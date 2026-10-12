import { describe, expect, it } from "vitest"
import type { SalePayload } from "../../../../lib/sync/core/payload"
import { matchesReceiptQuery, outboxSaleRow, outboxSaleToReceipt, parseSalePayload, sortLocalSales, type LocalSaleRow } from "../outboxSale"

const payload: SalePayload = {
  type: "sale",
  client_id: "c1",
  receipt_number: "D01-261012-0007",
  cashier_id: "u1",
  shift_client_id: "s1",
  sold_at: "2026-10-12T08:15:00.000Z",
  items: [
    { product_id: "p1", product_name: "Paracetamol", product_strength: "500mg", base_unit: "tablet", quantity: 20, unit_price: 5.5, discount_percent: 0, line_total: 110, is_controlled: false, sell_unit: { pack_size_id: "k1", unit_count: 10 } },
    { product_id: "p2", product_name: "Amoxil", product_strength: null, base_unit: "bottle", quantity: 1, unit_price: 150, discount_percent: 10, line_total: 135, is_controlled: false, sell_unit: null },
  ],
  discount_amount: 0,
  total_amount: 245,
  payment_method: "cash",
  cash_amount: null,
  mpesa_amount: null,
  mpesa_reference: null,
  mpesa_verified: true,
  amount_tendered: 300,
  change_given: 55,
  customer_name: null,
  customer_phone: null,
  override_client_id: null,
}

const rec = (over: Partial<{ type: string; payload: string; status: LocalSaleRow["status"]; errorMessage: string | null }> = {}) => ({
  clientId: "c1",
  type: "sale",
  payload: JSON.stringify(payload),
  status: "pending" as LocalSaleRow["status"],
  errorMessage: null,
  createdAt: 1,
  ...over,
})

describe("outbox sale → list row", () => {
  it("reads receipt, time, total and items from the payload", () => {
    expect(outboxSaleRow(rec())).toEqual({
      clientId: "c1",
      receiptNumber: "D01-261012-0007",
      soldAtMs: Date.parse("2026-10-12T08:15:00.000Z"),
      totalCents: 24500,
      paymentMethod: "cash",
      cashierId: "u1",
      itemCount: 2,
      status: "pending",
      errorMessage: null,
    })
  })
  it("keeps the server's reason on a rejected sale", () => {
    expect(outboxSaleRow(rec({ status: "rejected", errorMessage: "Insufficient stock" }))?.errorMessage).toBe("Insufficient stock")
  })
  it("skips other item types and unreadable payloads", () => {
    expect(outboxSaleRow(rec({ type: "shift_open" }))).toBeNull()
    expect(parseSalePayload({ type: "sale", payload: "{oops" })).toBeNull()
  })
  it("sorts rejected first, then newest", () => {
    const base = outboxSaleRow(rec())!
    const rows = sortLocalSales([
      { ...base, clientId: "old", soldAtMs: 1 },
      { ...base, clientId: "new", soldAtMs: 3 },
      { ...base, clientId: "bad", soldAtMs: 2, status: "rejected" },
    ])
    expect(rows.map((r) => r.clientId)).toEqual(["bad", "new", "old"])
  })
  it("filters by receipt number like the server", () => {
    expect(matchesReceiptQuery({ receiptNumber: "D01-261012-0007" }, "0007")).toBe(true)
    expect(matchesReceiptQuery({ receiptNumber: "D01-261012-0007" }, "d01")).toBe(true)
    expect(matchesReceiptQuery({ receiptNumber: "D01-261012-0007" }, "9999")).toBe(false)
    expect(matchesReceiptQuery({ receiptNumber: "D01-261012-0007" }, " ")).toBe(true)
  })
})

describe("outbox sale → receipt", () => {
  it("rebuilds the till receipt", () => {
    const r = outboxSaleToReceipt(payload, { shopName: "Afya", cashier: "Jane" })
    expect(r.lines[0]).toEqual({ name: "Paracetamol 500mg", qtyLabel: "2 × pack of 10", totalCents: 11000, discountCents: 0 })
    expect(r.lines[1]).toEqual({ name: "Amoxil", qtyLabel: "1 bottle", totalCents: 13500, discountCents: 1500 })
    expect(r).toMatchObject({ totalCents: 24500, discountCents: 1500, subtotalCents: 26000, paidCents: 30000, changeCents: 5500, paymentLabel: "Cash" })
  })
  it("split shows the cash part and pays the total", () => {
    const r = outboxSaleToReceipt(
      { ...payload, payment_method: "split", cash_amount: 100, mpesa_amount: 145, amount_tendered: 100, change_given: 0, mpesa_reference: "QWE" },
      { shopName: "Afya", cashier: "Jane" },
    )
    expect(r).toMatchObject({ paymentLabel: "Cash KES 100.00 + M-Pesa", paidCents: 24500, changeCents: 0, mpesaReference: "QWE" })
  })
})
