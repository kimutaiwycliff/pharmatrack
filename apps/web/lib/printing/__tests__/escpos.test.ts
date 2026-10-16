import { describe, expect, it } from "vitest"
import {
  EscPos, encodeReceipt, isStatusByte, pairLine, printerHealth, receiptPreview, scannerHealth, statusRequest, toPrinterText, wrapText,
  type ReceiptDoc,
} from "@pharmatrack/core"

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ")

describe("EscPos", () => {
  it("emits the standard commands", () => {
    const b = new EscPos().init().align("center").bold(true).size(2, 2).line("Hi").feed(3).cut().openDrawer().bytes()
    expect(hex(b)).toBe("1b 40 1b 74 00 1b 61 01 1b 45 01 1d 21 11 48 69 0a 1b 64 03 1d 56 42 03 1b 70 00 19 fa")
  })

  it("encodes a QR code with its length", () => {
    const b = hex(new EscPos().qr("AB", 4).bytes())
    expect(b).toContain("1d 28 6b 05 00 31 50 30 41 42") // store: pL = 2 + 3
    expect(b.endsWith("1d 28 6b 03 00 31 51 30")).toBe(true) // print
  })

  it("folds characters a thermal printer can't print", () => {
    expect(toPrinterText("2 × Strip – Café ’s • 5°")).toBe("2 x Strip - Cafe 's * 5o")
    expect(toPrinterText("药")).toBe("?")
  })

  it("builds the DLE EOT status request", () => {
    expect(hex(statusRequest(4))).toBe("10 04 04")
  })
})

describe("receipt layout", () => {
  const doc: ReceiptDoc = {
    shopName: "Afya Bora Chemist", branchName: "Westlands", phone: "0712 345678",
    receiptNumber: "R-000123", dateText: "15/10/2026 14:05", cashier: "Jane",
    lines: [
      { name: "Paracetamol 500mg Tablets (Panadol Advance) extra long name", qtyLabel: "2 x Strip of 10", totalCents: 10000 },
      { name: "Amoxil 500mg", qtyLabel: "21 capsules", totalCents: 63000, discountCents: 3000 },
    ],
    subtotalCents: 76000, discountCents: 3000, totalCents: 73000, paymentLabel: "Cash", paidCents: 100000, changeCents: 27000,
  }

  it("fits every line to 58 mm (32 columns) and 80 mm (48)", () => {
    for (const [paper, cols] of [["58mm", 32], ["80mm", 48]] as const) {
      const lines = receiptPreview(doc, paper)
      expect(lines.every((l) => l.length <= cols)).toBe(true)
      expect(lines).toContain("-".repeat(cols))
    }
  })

  it("prints the totals right-aligned", () => {
    const lines = receiptPreview(doc, "58mm")
    expect(lines).toContain(pairLine("Change", "KES 270.00", 32))
    expect(lines).toContain(pairLine("Paid (Cash)", "KES 1,000.00", 32))
    expect(pairLine("Paid (Cash)", "KES 1,000.00", 32)).toHaveLength(32)
    expect(lines.some((l) => l.startsWith("TOTAL") && l.endsWith("KES 730.00"))).toBe(true)
  })

  it("opens the drawer and cuts each copy", () => {
    const b = hex(encodeReceipt(doc, { paper: "80mm", openDrawer: true, copies: 2 }))
    expect(b.startsWith("1b 40 1b 74 00 1b 70 00 19 fa")).toBe(true)
    expect(b.split("1d 56 42 03").length - 1).toBe(2)
  })

  it("wraps long words and keeps values whole", () => {
    expect(wrapText("Supercalifragilistic", 8)).toEqual(["Supercal", "ifragili", "stic"])
    expect(pairLine("A very long label here", "KES 12.00", 20)).toBe("A very lo. KES 12.00")
  })
})

describe("device health", () => {
  it("reads printer status bytes", () => {
    expect(isStatusByte(0x12)).toBe(true)
    expect(isStatusByte(0x00)).toBe(false)
    expect(printerHealth({ reachable: true, printer: 0x12, offline: 0x12, paper: 0x12 }, true)).toMatchObject({ tone: "ok", label: "Printer ready" })
    expect(printerHealth({ reachable: true, paper: 0x12 | 0x60 }, true).label).toBe("Out of paper")
    expect(printerHealth({ reachable: true, paper: 0x12 | 0x0c }, true).label).toBe("Paper low")
    expect(printerHealth({ reachable: true, offline: 0x12 | 0x04 }, true).label).toBe("Cover open")
    expect(printerHealth({ reachable: true }, true)).toMatchObject({ tone: "ok", label: "Printer connected" })
    expect(printerHealth({ reachable: false, error: "Bluetooth is off" }, true)).toMatchObject({ tone: "down", detail: "Bluetooth is off" })
    expect(printerHealth(null, false).tone).toBe("none")
  })

  it("describes the scanner", () => {
    const now = Date.UTC(2026, 9, 15, 12)
    expect(scannerHealth({ connected: true, name: "Netum", now }).label).toBe("Scanner connected")
    expect(scannerHealth({ connected: false, now }).tone).toBe("down")
    expect(scannerHealth({ lastScanAt: now - 5 * 60_000, now })).toMatchObject({ tone: "ok", detail: "Last scan 5 min ago." })
    expect(scannerHealth({ lastScanAt: now - 3 * 3_600_000, now }).label).toBe("Scanner idle")
    expect(scannerHealth({ now }).label).toBe("Scanner: no scans yet")
  })
})
