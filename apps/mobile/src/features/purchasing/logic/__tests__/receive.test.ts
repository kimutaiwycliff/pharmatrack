import { describe, expect, it } from "vitest"
import { scanFields } from "../../../../lib/stock/scan-fields"
import {
  addBatch, batchPreview, buildReceivePayload, fillFromScan, findScannedItem, initReceiveForm, isShort, removeBatch,
  setClose, setIncluded, updateBatch, type ReceiveForm,
} from "../receive"
import type { PoItem } from "../types"

const TODAY = "2026-10-12"

function item(over: Partial<PoItem> = {}): PoItem {
  return {
    id: "i1", product_id: "p1", product_name: "Amoxil 500mg", product_strength: null, pack_label: "Box of 100",
    units_per_pack: 100, quantity_ordered: 10, quantity_received: 0, unit_cost: 450, line_total: 4500,
    gtin: "6291234567892", barcode_raw: null, base_unit: "capsule", stock_on_hand: 0, ...over,
  }
}

const A = item()
const B = item({ id: "i2", product_id: "p2", product_name: "Panadol", units_per_pack: 24, quantity_ordered: 5, quantity_received: 5, unit_cost: null, gtin: null, barcode_raw: "PAN-1" })
const GONE = item({ id: "i3", product_id: null, product_name: "Deleted thing" })

function fill(form: ReceiveForm, itemId: string, patch: { batchNumber?: string; expiry?: string; packs?: string; unitCost?: string }, idx = 0) {
  return updateBatch(form, itemId, form.lines[itemId]!.batches[idx]!.key, patch)
}

describe("initReceiveForm", () => {
  it("defaults packs to outstanding, cost to the PO cost, ticks only lines still owed, skips deleted products", () => {
    const f = initReceiveForm([A, B, GONE])
    expect(Object.keys(f.lines)).toEqual(["i1", "i2"])
    expect(f.lines.i1).toMatchObject({ included: true, batches: [{ packs: "10", unitCost: "450", batchNumber: "", expiry: "" }] })
    expect(f.lines.i2).toMatchObject({ included: false, batches: [{ packs: "1", unitCost: "" }] })
    expect(f.close).toBe(false)
  })
})

describe("buildReceivePayload", () => {
  it("builds exactly the receive route's shape, trimming and omitting unit_cost when not typed", () => {
    let f = initReceiveForm([A, B])
    f = fill(f, "i1", { batchNumber: "  AMX1 ", expiry: "2027-06-30", unitCost: "" })
    const r = buildReceivePayload(f, [A, B], { canSeeCost: true, today: TODAY })
    expect(r.problems).toEqual([])
    expect(r.payload).toEqual({ lines: [{ item_id: "i1", batches: [{ batch_number: "AMX1", expiry_date: "2027-06-30", quantity: 10 }] }], close: false })
  })

  it("sends unit_cost per pack only when cost is visible and entered", () => {
    let f = initReceiveForm([A])
    f = fill(f, "i1", { batchNumber: "X", expiry: "2027-01-01", unitCost: "1,200.555" })
    const seen = buildReceivePayload(f, [A], { canSeeCost: true, today: TODAY })
    expect(seen.payload!.lines[0]!.batches[0]!.unit_cost).toBe(1200.56)
    const hidden = buildReceivePayload(f, [A], { canSeeCost: false, today: TODAY })
    expect(hidden.payload!.lines[0]!.batches[0]).not.toHaveProperty("unit_cost")
    expect(hidden.summary.invoiceCents).toBeNull()
  })

  it("drops unticked lines and blank extra batches", () => {
    let f = initReceiveForm([A, B])
    f = setIncluded(f, "i2", true)
    f = fill(f, "i2", { batchNumber: "P1", expiry: "2027-01-01", packs: "2" })
    f = setIncluded(f, "i1", false)
    f = addBatch(f, "i2") // left blank → dropped
    const r = buildReceivePayload(f, [A, B], { canSeeCost: true, today: TODAY })
    expect(r.payload!.lines).toEqual([{ item_id: "i2", batches: [{ batch_number: "P1", expiry_date: "2027-01-01", quantity: 2 }] }])
  })

  it("validates batch number, expiry (future only), packs and cost with field messages", () => {
    let f = initReceiveForm([A])
    f = fill(f, "i1", { batchNumber: "", expiry: TODAY, packs: "0", unitCost: "abc" })
    f = addBatch(f, "i1")
    f = fill(f, "i1", { batchNumber: "OK", expiry: "", packs: "1", unitCost: "" }, 1)
    const r = buildReceivePayload(f, [A], { canSeeCost: true, today: TODAY })
    expect(r.payload).toBeNull()
    const [k1, k2] = f.lines.i1!.batches.map((b) => b.key)
    expect(r.errors[k1!]).toEqual({
      batchNumber: "Enter the batch number",
      expiry: "This batch has already expired",
      packs: "Enter how many packs arrived",
      unitCost: "Enter a valid cost, e.g. 450 or 450.50",
    })
    expect(r.errors[k2!]).toEqual({ expiry: "Pick the expiry date" })
    expect(r.problems[0]).toBe("Amoxil 500mg (batch 1): enter the batch number")
  })

  it("flags a ticked line with nothing filled in, and nothing ticked at all", () => {
    const f = initReceiveForm([A])
    const r = buildReceivePayload(f, [A], { canSeeCost: false, today: TODAY })
    expect(r.payload).toBeNull()
    expect(r.problems).toContain("Amoxil 500mg: enter the batch number")
    const none = buildReceivePayload(setIncluded(f, "i1", false), [A], { canSeeCost: false, today: TODAY })
    expect(none.problems[0]).toBe("Tick at least one item that arrived")
  })

  it("sends close only when the order would still be short", () => {
    let f = initReceiveForm([A])
    f = fill(f, "i1", { batchNumber: "X", expiry: "2027-01-01", packs: "4" })
    f = setClose(f, true)
    expect(isShort(f, [A])).toBe(true)
    expect(buildReceivePayload(f, [A], { canSeeCost: false, today: TODAY }).payload!.close).toBe(true)
    f = fill(f, "i1", { packs: "10" })
    expect(isShort(f, [A])).toBe(false)
    expect(buildReceivePayload(f, [A], { canSeeCost: false, today: TODAY }).payload!.close).toBe(false)
  })

  it("summarises lines, batches, packs → base units and invoice value in cents", () => {
    let f = initReceiveForm([A])
    f = fill(f, "i1", { batchNumber: "X", expiry: "2027-01-01", packs: "3", unitCost: "" })
    f = addBatch(f, "i1")
    f = fill(f, "i1", { batchNumber: "Y", expiry: "2027-02-01", packs: "2", unitCost: "500.10" }, 1)
    const r = buildReceivePayload(f, [A], { canSeeCost: true, today: TODAY })
    expect(r.summary).toEqual({ lines: 1, batches: 2, packs: 5, units: 500, invoiceCents: 3 * 45000 + 2 * 50010 })
  })
})

describe("batch rows", () => {
  it("adds batches with one pack and the first row's cost; never removes the last row", () => {
    let f = initReceiveForm([A])
    f = addBatch(f, "i1")
    expect(f.lines.i1!.batches[1]).toMatchObject({ packs: "1", unitCost: "450" })
    expect(new Set(f.lines.i1!.batches.map((b) => b.key)).size).toBe(2)
    f = removeBatch(f, "i1", f.lines.i1!.batches[1]!.key)
    f = removeBatch(f, "i1", f.lines.i1!.batches[0]!.key)
    expect(f.lines.i1!.batches).toHaveLength(1)
  })
})

describe("batchPreview", () => {
  it("converts packs to base units and cost per pack to cost per base unit", () => {
    const f = initReceiveForm([A])
    const b = { ...f.lines.i1!.batches[0]!, packs: "3", unitCost: "455" }
    expect(batchPreview(b, A, true)).toEqual({ units: 300, costPerUnit: 4.55, costDiffCents: 500 })
    expect(batchPreview({ ...b, unitCost: "" }, A, true)).toEqual({ units: 300, costPerUnit: 4.5, costDiffCents: null })
    expect(batchPreview({ ...b, packs: "x" }, A, false)).toEqual({ units: null, costPerUnit: null, costDiffCents: null })
  })
})

describe("scanning", () => {
  it("matches a line by GTIN or raw barcode", () => {
    expect(findScannedItem([A, B], scanFields("01062912345678921727063010LOT9"))?.id).toBe("i1")
    expect(findScannedItem([A, B], scanFields("PAN-1"))?.id).toBe("i2")
    expect(findScannedItem([A, B], scanFields("5000000000001"))).toBeNull()
  })

  it("fills the next empty batch, then starts a new row for a different lot", () => {
    let f = setIncluded(initReceiveForm([A]), "i1", false)
    const s1 = scanFields("01062912345678921727063010LOT9")
    const r1 = fillFromScan(f, "i1", s1)
    f = r1.form
    expect(f.lines.i1!.included).toBe(true)
    expect(f.lines.i1!.batches[0]).toMatchObject({ batchNumber: "LOT9", expiry: "2027-06-30" })
    // Same lot again → nothing to fill.
    expect(fillFromScan(f, "i1", s1).filledKey).toBeNull()
    const r2 = fillFromScan(f, "i1", scanFields("01062912345678921728010110LOT10"))
    expect(r2.form.lines.i1!.batches).toHaveLength(2)
    expect(r2.form.lines.i1!.batches[1]).toMatchObject({ batchNumber: "LOT10", expiry: "2028-01-01", packs: "1" })
  })
})
