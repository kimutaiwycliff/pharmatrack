import { describe, expect, it, vi } from "vitest"
import { isCashPayment, parseNetworkTarget, pickScanner, receiptDocFromReceipt, targetLabel } from "../logic"

// vi.mock is hoisted above the imports.

vi.mock("../native", () => ({}))
vi.mock("../../../features/pos/logic/receipt", () => ({
  nairobiDateTime: (ms: number) => `T${ms}`,
}))


describe("printer logic", () => {
  it("maps a till receipt to the shared receipt model", () => {
    const doc = receiptDocFromReceipt({
      shopName: "Afya", receiptNumber: "R-1", soldAtMs: 5, cashier: "Jane",
      lines: [{ name: "Panadol", qtyLabel: "2 strips", totalCents: 200, discountCents: 0 }],
      subtotalCents: 200, discountCents: 0, totalCents: 200, paymentLabel: "Cash", paidCents: 500, changeCents: 300, mpesaReference: null,
    }, { branchName: "Main" })
    expect(doc).toMatchObject({ shopName: "Afya", branchName: "Main", dateText: "T5", totalCents: 200, changeCents: 300 })
    expect(doc.lines[0]).toEqual({ name: "Panadol", qtyLabel: "2 strips", totalCents: 200, discountCents: 0 })
  })

  it("only kicks the drawer for cash", () => {
    expect(isCashPayment("Cash")).toBe(true)
    expect(isCashPayment("Cash + M-Pesa")).toBe(true)
    expect(isCashPayment("M-Pesa")).toBe(false)
  })

  it("validates network printer addresses", () => {
    expect(parseNetworkTarget("192.168.1.100", "")).toEqual({ ok: true, host: "192.168.1.100", port: 9100 })
    expect(parseNetworkTarget("192.168.1.300", "9100").ok).toBe(false)
    expect(parseNetworkTarget("", "9100").ok).toBe(false)
    expect(parseNetworkTarget("printer.local", "70000").ok).toBe(false)
  })

  it("labels targets and picks the scanner among keyboards", () => {
    expect(targetLabel("bluetooth", "XP-P58")).toBe("XP-P58 (Bluetooth)")
    const kb = { id: 1, name: "Logitech K380", vendorId: 1, productId: 1, likelyScanner: false }
    const sc = { id: 2, name: "Netum Scanner", vendorId: 2, productId: 2, likelyScanner: true }
    expect(pickScanner([kb, sc])).toBe(sc)
    expect(pickScanner([kb])).toBe(kb)
    expect(pickScanner([])).toBeNull()
  })
})
