import { describe, expect, it } from "vitest"
import { changeCents, quickCashOptions } from "../quickCash"

describe("quickCashOptions", () => {
  it("exact first, then the next round amounts above the total", () => {
    expect(quickCashOptions(124_000)).toEqual([124_000, 125_000, 130_000, 140_000, 150_000, 200_000])
  })
  it("skips duplicates and amounts equal to the total", () => {
    // KES 1,000 exactly: every step's 'next' must be strictly above it.
    expect(quickCashOptions(100_000)).toEqual([100_000, 105_000, 110_000, 120_000, 150_000, 200_000])
    // KES 30: 50 and 100 → 50, 100; 200 → 200; 500; 1000.
    expect(quickCashOptions(3_000)).toEqual([3_000, 5_000, 10_000, 20_000, 50_000, 100_000])
  })
  it("handles cents in the total", () => {
    expect(quickCashOptions(4_550)[0]).toBe(4_550)
    expect(quickCashOptions(4_550)[1]).toBe(5_000)
  })
  it("nothing for an empty total", () => {
    expect(quickCashOptions(0)).toEqual([])
  })
  it("change vs shortfall", () => {
    expect(changeCents(150_000, 124_000)).toBe(26_000)
    expect(changeCents(100_000, 124_000)).toBe(-24_000)
  })
})
