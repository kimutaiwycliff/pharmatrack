import { describe, expect, it } from "vitest"
import { costPerPack, costPerUnit, packsToUnits, parseAmount, parsePacks } from "../units"

describe("stock units", () => {
  it("converts packs to base units", () => {
    expect(packsToUnits(3, 100)).toBe(300)
    expect(packsToUnits(5, null)).toBe(5)
    expect(packsToUnits(2, 0)).toBe(2)
  })

  it("converts cost per pack to per base unit, rounded to the cent like the server", () => {
    expect(costPerUnit(250, 100)).toBe(2.5)
    expect(costPerUnit(100, 3)).toBe(33.33)
    expect(costPerUnit(80, null)).toBe(80)
  })

  it("prefills cost per pack from a stored per-unit cost", () => {
    expect(costPerPack(2.5, 100)).toBe(250)
    expect(costPerPack(null, 10)).toBeNull()
  })

  it("parses typed amounts and pack counts", () => {
    expect(parseAmount("1,250.50")).toBe(1250.5)
    expect(parseAmount("")).toBeNull()
    expect(parseAmount("-3")).toBeNull()
    expect(parsePacks("12")).toBe(12)
    expect(parsePacks("0")).toBeNull()
    expect(parsePacks("1.5")).toBeNull()
  })
})
