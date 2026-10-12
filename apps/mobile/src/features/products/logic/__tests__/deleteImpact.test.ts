import { describe, expect, it } from "vitest"
import { erasedLines, historyLines, impactFromConflict, keptLines, nameMatches, removePlan } from "../deleteImpact"

const used = { batches: 3, unitsOnHand: 120, saleLines: 48, adjustments: 1, prescriptionLines: 0, clean: false }
const clean = { batches: 0, unitsOnHand: 0, saleLines: 0, adjustments: 0, prescriptionLines: 0, clean: true }

describe("removePlan", () => {
  it("offers a plain delete for unused products", () => {
    expect(removePlan({ impact: clean, isActive: true, canEdit: true, canDeletePermanent: true, serverAllowsPermanent: true })).toEqual({ kind: "clean" })
  })

  it("recommends deactivate and gates permanent delete on both checks", () => {
    expect(removePlan({ impact: used, isActive: true, canEdit: true, canDeletePermanent: true, serverAllowsPermanent: false })).toEqual({
      kind: "history", deactivate: "available", permanent: false,
    })
    expect(removePlan({ impact: used, isActive: false, canEdit: true, canDeletePermanent: true, serverAllowsPermanent: true })).toEqual({
      kind: "history", deactivate: "already", permanent: true,
    })
    expect(removePlan({ impact: used, isActive: true, canEdit: false, canDeletePermanent: false, serverAllowsPermanent: true })).toEqual({
      kind: "history", deactivate: "hidden", permanent: false,
    })
  })
})

describe("impact copy", () => {
  it("lists history like the web dialog", () => {
    expect(historyLines(used)).toEqual(["3 batches · 120 units on hand", "48 sales lines", "1 stock adjustment"])
  })

  it("lists what is erased and kept", () => {
    expect(erasedLines(used)).toEqual([
      "The product, its pack sizes and barcode",
      "3 batches — including 120 units still on hand",
      "1 stock adjustment",
    ])
    expect(keptLines(used)[0]).toBe("48 past sales lines — receipts, revenue and profit stay correct")
    expect(keptLines(clean)).toHaveLength(2)
  })
})

describe("nameMatches", () => {
  it("is trimmed and case-insensitive, never empty", () => {
    expect(nameMatches("  amoxicillin ", "Amoxicillin")).toBe(true)
    expect(nameMatches("Amox", "Amoxicillin")).toBe(false)
    expect(nameMatches("", "")).toBe(false)
  })
})

describe("impactFromConflict", () => {
  it("reads the impact out of a 409 body", () => {
    expect(impactFromConflict({ error: "x", impact: used })).toEqual(used)
    expect(impactFromConflict({ error: "x" })).toBeNull()
    expect(impactFromConflict(null)).toBeNull()
  })
})
