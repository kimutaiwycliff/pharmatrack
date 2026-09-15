import { describe, it, expect } from "vitest"
import { encodeCode128B, barsFromWidths, generateInternalBarcode } from "@pharmatrack/core"

describe("encodeCode128B", () => {
  it("encodes a single character with the exact hand-computed widths", () => {
    // "A" → value 33. Checksum = (104 + 33*1) % 103 = 34.
    // Start B (104) widths: 211214, 'A' (33) widths: 111323, check (34) widths: 131123, Stop widths: 2331112
    expect(encodeCode128B("A")).toEqual([
      2, 1, 1, 2, 1, 4,
      1, 1, 1, 3, 2, 3,
      1, 3, 1, 1, 2, 3,
      2, 3, 3, 1, 1, 1, 2,
    ])
  })

  it("encodes two characters with the exact hand-computed widths", () => {
    // "AB" → values 33, 34. Checksum = (104 + 33*1 + 34*2) % 103 = 205 % 103 = 102.
    // 'A' (33) widths: 111323, 'B' (34) widths: 131123, check (102) widths: 411131
    expect(encodeCode128B("AB")).toEqual([
      2, 1, 1, 2, 1, 4, // Start B
      1, 1, 1, 3, 2, 3, // 'A' (33)
      1, 3, 1, 1, 2, 3, // 'B' (34)
      4, 1, 1, 1, 3, 1, // check (102)
      2, 3, 3, 1, 1, 1, 2, // Stop
    ])
  })

  it("produces a total module count matching the Code 128 formula (11*(2+n)+13)", () => {
    const widths = encodeCode128B("PT1A2B3C")
    const total = widths.reduce((a, b) => a + b, 0)
    expect(total).toBe(11 * (2 + "PT1A2B3C".length) + 13)
  })

  it("always starts with Start B's pattern (bar width 2)", () => {
    expect(encodeCode128B("XYZ")[0]).toBe(2)
  })

  it("throws on an empty string", () => {
    expect(() => encodeCode128B("")).toThrow()
  })

  it("throws on a character outside printable ASCII", () => {
    expect(() => encodeCode128B("A\nB")).toThrow()
  })

  it("accepts digits and uppercase letters (generated-SKU alphabet)", () => {
    expect(() => encodeCode128B("PTLK3F9QX7B2")).not.toThrow()
  })
})

describe("barsFromWidths", () => {
  it("extracts only bar (even-index) segments with correct x offsets", () => {
    // widths: bar 2, space 1, bar 3, space 1 → two bars, at x=0 and x=3
    const rects = barsFromWidths([2, 1, 3, 1], 1)
    expect(rects).toEqual([
      { x: 0, width: 2 },
      { x: 3, width: 3 },
    ])
  })

  it("scales widths by moduleWidth", () => {
    const rects = barsFromWidths([2, 1], 3)
    expect(rects).toEqual([{ x: 0, width: 6 }])
  })
})

describe("generateInternalBarcode", () => {
  it("produces a Code128-safe, PT-prefixed code", () => {
    const code = generateInternalBarcode()
    expect(code.startsWith("PT")).toBe(true)
    expect(code).toMatch(/^PT[0-9A-Z]+$/)
    expect(() => encodeCode128B(code)).not.toThrow()
  })

  it("produces different codes across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInternalBarcode()))
    expect(codes.size).toBeGreaterThan(1)
  })
})
