import { describe, expect, it, vi } from "vitest"
import { isCashPayment, parseNetworkTarget, pickScanner, targetLabel } from "../logic"

// vi.mock is hoisted above the imports.

vi.mock("../native", () => ({}))


describe("printer logic", () => {
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
