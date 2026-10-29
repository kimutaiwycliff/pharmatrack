import { describe, expect, it } from "vitest"
import { parseBarcode, scanFromSearchBox, wedgeKeyChar, WEDGE_GS } from "@pharmatrack/core"

// What a keyboard-wedge scanner "types" for a GS1 DataMatrix whose batch (a
// variable-length field) comes before the expiry: the separator arrives as Ctrl+].
const keys = (s: string) => [...s].map((c) => (c === "|" ? { key: "]", code: "BracketRight", ctrlKey: true } : { key: c }))

describe("wedgeKeyChar", () => {
  it("turns Ctrl+] into the GS1 separator", () => {
    expect(wedgeKeyChar({ key: "]", code: "BracketRight", ctrlKey: true })).toBe(WEDGE_GS)
    expect(wedgeKeyChar({ key: "Dead", code: "BracketRight", ctrlKey: true })).toBe(WEDGE_GS)
    expect(wedgeKeyChar({ key: WEDGE_GS })).toBe(WEDGE_GS)
  })
  it("keeps plain characters and drops other shortcuts and named keys", () => {
    expect(wedgeKeyChar({ key: "]" })).toBe("]")
    expect(wedgeKeyChar({ key: "7" })).toBe("7")
    expect(wedgeKeyChar({ key: "c", ctrlKey: true })).toBeNull()
    expect(wedgeKeyChar({ key: "Shift" })).toBeNull()
    expect(wedgeKeyChar({ key: "Tab" })).toBeNull()
  })
  it("reads a bare code with no prefix or separator (Android, prefix off)", () => {
    const r = parseBarcode("01069010280759091727113010LOT7A")
    expect(r.type).toBe("GS1_128")
    expect(r.gtin).toBe("6901028075909")
    expect(r.batchNumber).toBe("LOT7A")
    expect(r.expiryDate?.getMonth()).toBe(10)
  })
  it("splits an expiry glued onto the batch when the separator was dropped", () => {
    const r = parseBarcode("010690102807590910LOT7A17271130")
    expect(r.batchNumber).toBe("LOT7A")
    expect(r.expiryDate?.getFullYear()).toBe(2027)
    expect(r.expiryDate?.getDate()).toBe(30)
  })
  it("leaves a plain EAN-13 alone", () => {
    expect(parseBarcode("6901028075909").type).toBe("EAN13")
  })
  it("lets the parser split batch from expiry", () => {
    const raw = keys("]d20106901028075909" + "10LOT7A|" + "17271130").map(wedgeKeyChar).join("")
    const r = parseBarcode(raw)
    expect(r.gtin).toBe("6901028075909")
    expect(r.batchNumber).toBe("LOT7A")
    expect(r.expiryDate?.getFullYear()).toBe(2027)
    expect(r.expiryDate?.getMonth()).toBe(10)
  })
})

describe("scanFromSearchBox", () => {
  it("treats a scanner burst into the box as a scan, separator kept", () => {
    const burst = "0106901028075909" + "10LOT7A" + WEDGE_GS + "17271130"
    expect(scanFromSearchBox(burst, "0106901028075909" + "10LOT7A17271130")).toBe(burst)
    // Something typed before the scan is left out of the code.
    expect(scanFromSearchBox("6901028075909", "para6901028075909")).toBe("6901028075909")
  })
  it("still catches a barcode typed by hand", () => {
    expect(scanFromSearchBox("", "6901028075909")).toBe("6901028075909")
    expect(scanFromSearchBox("", " 12345678 ")).toBe("12345678")
    expect(scanFromSearchBox("", "PTMH8K2Q1ZAB3C")).toBe("PTMH8K2Q1ZAB3C")
  })
  it("leaves ordinary searches alone", () => {
    expect(scanFromSearchBox("", "paracetamol")).toBeNull()
    expect(scanFromSearchBox("", "500")).toBeNull()
    expect(scanFromSearchBox("", "amoxil 250")).toBeNull()
    expect(scanFromSearchBox("pan", "panadol")).toBeNull() // fast typist, too short for a scan
    expect(scanFromSearchBox("augmentin", "augmentin")).toBeNull() // fast typist, no digits
    expect(scanFromSearchBox("amoxil 250", "amoxil 250")).toBeNull() // has a space
  })
})
