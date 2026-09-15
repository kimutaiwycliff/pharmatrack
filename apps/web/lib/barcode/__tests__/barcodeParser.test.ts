import { describe, it, expect } from "vitest"
import {
  parseBarcode,
  isGS1,
  normalizeGTIN,
  detectBarcodeType,
} from "@pharmatrack/core"

describe("normalizeGTIN", () => {
  it("strips leading zero from GTIN-14 to produce GTIN-13", () => {
    expect(normalizeGTIN("06901028075909")).toBe("6901028075909")
  })

  it("leaves GTIN-13 unchanged", () => {
    expect(normalizeGTIN("6901028075909")).toBe("6901028075909")
  })

  it("leaves GTIN-14 without leading zero unchanged", () => {
    expect(normalizeGTIN("16901028075909")).toBe("16901028075909")
  })
})

describe("isGS1", () => {
  it("detects FNC1 character (ASCII 29)", () => {
    expect(isGS1("\x1D010690102807590917261231")).toBe(true)
  })

  it("detects ]d2 symbology identifier", () => {
    expect(isGS1("]d2010690102807590917261231")).toBe(true)
  })

  it("detects ]C1 symbology identifier", () => {
    expect(isGS1("]C1010690102807590917261231")).toBe(true)
  })

  it("returns false for plain EAN-13", () => {
    expect(isGS1("6901028075909")).toBe(false)
  })
})

describe("detectBarcodeType", () => {
  it("detects EAN13 for 13-digit numeric string", () => {
    expect(detectBarcodeType("6901028075909")).toBe("EAN13")
  })

  it("detects EAN8 for 8-digit numeric string", () => {
    expect(detectBarcodeType("12345678")).toBe("EAN8")
  })

  it("detects GS1_128 for string with FNC1", () => {
    expect(detectBarcodeType("\x1D010690102807590917261231")).toBe("GS1_128")
  })

  it("detects CODE39 for uppercase alphanumeric", () => {
    expect(detectBarcodeType("BATCH-001")).toBe("CODE39")
  })
})

describe("parseBarcode — plain EAN-13", () => {
  it("returns EAN13 type with gtin set", () => {
    const result = parseBarcode("6901028075909")
    expect(result.type).toBe("EAN13")
    expect(result.gtin).toBe("6901028075909")
    expect(result.raw).toBe("6901028075909")
  })
})

describe("parseBarcode — GS1-128 with GTIN + expiry + batch", () => {
  // Construct: AI(01) GTIN-14 + AI(17) YYMMDD + AI(10) batch
  // ]d2 prefix + 01 + 06901028075909 + 17 + 261231 + FNC1 + 10 + LOT123
  const gs1Raw = "]d201069010280759091726123110LOT123"

  it("extracts GTIN and normalizes from 14 to 13 digits", () => {
    const result = parseBarcode(gs1Raw)
    expect(result.type).toBe("GS1_128")
    expect(result.gtin).toBe("6901028075909")
  })

  it("parses expiry date", () => {
    const result = parseBarcode(gs1Raw)
    expect(result.expiryDate).toBeInstanceOf(Date)
    if (result.expiryDate) {
      expect(result.expiryDate.getFullYear()).toBe(2026)
      expect(result.expiryDate.getMonth()).toBe(11) // December (0-based)
      expect(result.expiryDate.getDate()).toBe(31)
    }
  })

  it("parses batch number", () => {
    const result = parseBarcode(gs1Raw)
    expect(result.batchNumber).toBe("LOT123")
  })
})

describe("parseBarcode — expiry day=00 maps to last day of month", () => {
  // AI(17) 261200 = December 2026, day 00 → last day of December = Dec 31
  const gs1Raw = "]d201069010280759091726120010LOT999"

  it("maps day 00 to last day of the month", () => {
    const result = parseBarcode(gs1Raw)
    expect(result.expiryDate).toBeInstanceOf(Date)
    if (result.expiryDate) {
      expect(result.expiryDate.getFullYear()).toBe(2026)
      expect(result.expiryDate.getMonth()).toBe(11) // December
      expect(result.expiryDate.getDate()).toBe(31) // last day
    }
  })
})
