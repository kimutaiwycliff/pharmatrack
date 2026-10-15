import { describe, expect, it } from "vitest"
import { packPriceFromUnit, readScannedCode, unitPriceFromPack } from "../entry"

describe("readScannedCode", () => {
  it("reads EAN-13 / GTIN-14 barcodes", () => {
    expect(readScannedCode("6164001234567")).toEqual({ code: "6164001234567" })
    expect(readScannedCode(" 06164001234567 ")).toEqual({ code: "6164001234567" })
  })

  it("reads batch and expiry from a GS1 label", () => {
    const r = readScannedCode("]d201061640012345671728063010LOT42")
    expect(r?.code).toBe("6164001234567")
    expect(r?.batchNumber).toBe("LOT42")
    expect(r?.expiryDate).toBe("2028-06-30")
  })

  it("treats words as a product search", () => {
    expect(readScannedCode("panadol")).toBeNull()
    expect(readScannedCode("amoxil 500")).toBeNull()
    expect(readScannedCode("1234")).toBeNull()
  })
})

describe("pack / unit prices", () => {
  it("converts both ways in cents", () => {
    expect(unitPriceFromPack("100", 3)).toBe("33.33")
    expect(unitPriceFromPack("250", 10)).toBe("25")
    expect(packPriceFromUnit("2.5", 10)).toBe("25")
    expect(packPriceFromUnit("0.1", 3)).toBe("0.3")
  })

  it("returns blank for unusable input", () => {
    expect(unitPriceFromPack("", 10)).toBe("")
    expect(unitPriceFromPack("abc", 10)).toBe("")
    expect(packPriceFromUnit("5", 0)).toBe("")
  })
})
