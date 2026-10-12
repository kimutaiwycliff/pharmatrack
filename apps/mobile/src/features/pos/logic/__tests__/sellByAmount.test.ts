import { describe, expect, it } from "vitest"
import { sellByAmount } from "../sellByAmount"

describe("sellByAmount", () => {
  it("whole units when the amount divides evenly", () => {
    expect(sellByAmount(2_000, 500)).toEqual({ kind: "exact", options: [{ units: 4, cents: 2_000 }] })
  })
  it("offers the nearest lower and higher whole quantities", () => {
    expect(sellByAmount(2_000, 300)).toEqual({
      kind: "between",
      options: [
        { units: 6, cents: 1_800 },
        { units: 7, cents: 2_100 },
      ],
    })
  })
  it("explains when the amount is below one unit", () => {
    expect(sellByAmount(200, 500)).toEqual({ kind: "tooSmall", unitPriceCents: 500 })
  })
  it("ignores empty input or an unpriced product", () => {
    expect(sellByAmount(0, 500).kind).toBe("empty")
    expect(sellByAmount(1_000, 0).kind).toBe("empty")
  })
})
