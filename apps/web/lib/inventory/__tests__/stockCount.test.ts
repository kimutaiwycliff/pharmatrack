import { describe, expect, it } from "vitest"
import { applyCount, countDelta, expiryMonthEnd, splitUnits, summariseCount, toBaseUnits, type CountLineFacts } from "@pharmatrack/core"

const batch = (counted: number, expected: number, over: Partial<CountLineFacts> = {}): CountLineFacts =>
  ({ kind: "batch", counted, expected, unitCost: 10, controlled: false, ...over })

describe("packs and loose units", () => {
  it("converts both ways", () => {
    expect(toBaseUnits(3, 14, 100)).toBe(314)
    expect(splitUnits(314, 100)).toEqual({ packs: 3, loose: 14 })
    expect(toBaseUnits(2, 0, 0)).toBe(2) // no pack size → units
  })
})

describe("applying a count", () => {
  it("applies the difference to the quantity now, so sales during the count still come off", () => {
    // Recorded 50 when counted, shelf had 48; 5 sold since → 45 now.
    expect(countDelta(48, 50)).toBe(-2)
    expect(applyCount(45, 48, 50)).toBe(43)
  })
  it("never goes below zero", () => {
    expect(applyCount(1, 0, 10)).toBe(0)
  })
  it("treats a batch the system didn't know as all found", () => {
    expect(countDelta(12, null)).toBe(12)
  })
})

describe("summariseCount", () => {
  it("lets small differences post without approval", () => {
    const s = summariseCount([batch(48, 50), batch(31, 30), batch(20, 20)])
    expect(s.changed).toBe(2)
    expect(s.unitsMissing).toBe(2)
    expect(s.unitsFound).toBe(1)
    expect(s.valueMissing).toBe(20)
    expect(s.approvalReasons).toEqual([])
  })
  it("asks for approval for big or costly differences and controlled drugs", () => {
    expect(summariseCount([batch(40, 50)]).approvalReasons[0]).toMatch(/^1 difference over 2 units/)
    expect(summariseCount([batch(49, 50, { unitCost: 1500 })]).approvalReasons).toHaveLength(1)
    expect(summariseCount([batch(49, 50, { controlled: true })]).approvalReasons).toEqual(["1 controlled drug changed"])
  })
  it("counts new batches and new products, flagging unconfirmed prices", () => {
    const s = summariseCount([
      { kind: "new_batch", counted: 6, expected: null, unitCost: null, controlled: false },
      { kind: "new_product", counted: 10, expected: null, unitCost: null, controlled: false, priceConfirmed: true },
      { kind: "new_product", counted: 4, expected: null, unitCost: null, controlled: false },
    ])
    expect(s.newBatches).toBe(1)
    expect(s.newProducts).toBe(2)
    expect(s.unpriced).toBe(1)
    expect(s.approvalReasons).toEqual([])
  })
})

describe("expiryMonthEnd", () => {
  it("uses the last day of the month", () => {
    expect(expiryMonthEnd("2028-02")).toBe("2028-02-29")
    expect(expiryMonthEnd("2027-06")).toBe("2027-06-30")
    expect(expiryMonthEnd("2027-13")).toBeNull()
  })
})
