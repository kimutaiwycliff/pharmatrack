import { describe, expect, it } from "vitest"
import { scanFields, scanMatchesProduct } from "../scan-fields"

const GS = "\x1D"

describe("scanFields", () => {
  it("reads GTIN, batch and expiry from a bare camera GS1 string", () => {
    const f = scanFields("01062912345678921726123110AB12C")
    expect(f.gtin).toBe("6291234567892")
    expect(f.expiry).toBe("2026-12-31")
    expect(f.batchNumber).toBe("AB12C")
  })

  it("reads FNC1-separated GS1 (batch before expiry)", () => {
    const f = scanFields(`]d201062912345678921012345${GS}17270630`)
    expect(f.gtin).toBe("6291234567892")
    expect(f.batchNumber).toBe("12345")
    expect(f.expiry).toBe("2027-06-30")
  })

  it("treats a plain EAN-13 as a GTIN with no batch/expiry", () => {
    expect(scanFields("6291234567892")).toEqual({ raw: "6291234567892", gtin: "6291234567892", batchNumber: null, expiry: null })
  })
})

describe("scanMatchesProduct", () => {
  it("matches on GTIN (13 vs 14 digit) or the stored raw barcode", () => {
    const s = scanFields("6291234567892")
    expect(scanMatchesProduct(s, { gtin: "06291234567892" })).toBe(true)
    expect(scanMatchesProduct(s, { gtin: "1111111111111" })).toBe(false)
    expect(scanMatchesProduct(scanFields("XYZ-1"), { barcode_raw: "XYZ-1" })).toBe(true)
  })
})
