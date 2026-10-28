import { describe, expect, it } from "vitest"
import { amountLabel, countedOf, dueShelves, hydrate, mergeQueue, settleQueue, toLine, type Draft, type Shelf } from "../logic"

const draft = (over: Partial<Draft> = {}): Draft => ({
  id: "l1", itemKey: "p:a", productId: "a", catalogId: null, batchId: "b1", batchNumber: "", expiry: "", packs: "", loose: "", ...over,
})

describe("counting", () => {
  it("adds packs and loose units", () => {
    expect(countedOf({ packs: "3", loose: "14" }, 100)).toBe(314)
    expect(countedOf({ packs: "", loose: "" }, 10)).toBeNull()
    expect(countedOf({ packs: "0", loose: "" }, 10)).toBe(0)
  })
  it("labels amounts in packs, or units when sold singly", () => {
    expect(amountLabel(34, { unitsPerPack: 10, packLabel: "Strip of 10", baseUnit: "tablet" })).toBe("3 × Strip of 10 + 4")
    expect(amountLabel(20, { unitsPerPack: 10, packLabel: null, baseUnit: "tablet" })).toBe("2 packs")
    expect(amountLabel(1, { unitsPerPack: 1, packLabel: null, baseUnit: "bottle" })).toBe("1 bottle")
  })
})

describe("toLine", () => {
  it("saves a counted batch", () => {
    const r = toLine(draft({ packs: "2", loose: "5" }), { unitsPerPack: 10 }, undefined, undefined)
    expect(r).toMatchObject({ kind: "save", line: { counted_qty: 25, batch_id: "b1", expiry_date: null, price_confirmed: false } })
  })
  it("deletes a cleared line and waits for a found batch's expiry", () => {
    expect(toLine(draft(), { unitsPerPack: 1 }, undefined, undefined).kind).toBe("delete")
    expect(toLine(draft({ batchId: null, packs: "4" }), { unitsPerPack: 1 }, undefined, undefined).kind).toBe("wait")
    const r = toLine(draft({ batchId: null, packs: "4", expiry: "2027-08" }), { unitsPerPack: 1 }, undefined, undefined)
    expect(r).toMatchObject({ kind: "save", line: { expiry_date: "2027-08-31" } })
  })
  it("confirms a price only when one is typed, cost per pack stored per unit", () => {
    const r = toLine(draft({ packs: "1" }), { unitsPerPack: 10 }, { sell: "12", costPack: "80" }, "123")
    expect(r).toMatchObject({ kind: "save", line: { selling_price: 12, price_confirmed: true, cost_price: 8, barcode: "123" } })
    const none = toLine(draft({ packs: "1" }), { unitsPerPack: 10 }, { sell: "", costPack: "" }, undefined)
    expect(none).toMatchObject({ kind: "save", line: { price_confirmed: false, selling_price: null } })
  })
})

describe("offline queue", () => {
  const line = (id: string, n: number) => ({ id, product_id: "a", catalog_id: null, batch_id: "b", batch_number: null, expiry_date: null, barcode: null, counted_qty: n, selling_price: null, price_confirmed: false, cost_price: null })
  it("keeps the newest edit and lets a delete cancel a save", () => {
    let q = mergeQueue({ lines: {}, deletes: [] }, [line("x", 1), line("y", 2)], [])
    q = mergeQueue(q, [line("x", 5)], ["y"])
    expect(q.lines.x!.counted_qty).toBe(5)
    expect(q.lines.y).toBeUndefined()
    expect(q.deletes).toEqual(["y"])
  })
  it("keeps edits made while a save was in flight", () => {
    const sent = mergeQueue({ lines: {}, deletes: [] }, [line("x", 1)], ["z"])
    const now = mergeQueue(sent, [line("x", 2)], [])
    expect(settleQueue(now, sent)).toEqual({ lines: { x: line("x", 2) }, deletes: [] })
  })
})

describe("hydrate", () => {
  it("turns saved lines back into drafts, prices and barcodes", () => {
    const h = hydrate({
      items: [{ key: "p:a", unitsPerPack: 10 } as never],
      lines: [{ id: "l1", product_id: "a", catalog_id: null, batch_id: "b1", batch_number: null, expiry_date: null, barcode: "999", expected_qty: 30, counted_qty: 25, selling_price: 12, cost_price: 8, price_confirmed: true }],
    })
    expect(h.drafts.l1).toMatchObject({ packs: "2", loose: "5", itemKey: "p:a" })
    expect(h.prices["p:a"]).toEqual({ sell: "12", costPack: "80" })
    expect(h.barcodes["p:a"]).toBe("999")
  })
})

describe("dueShelves", () => {
  it("lists stocked shelves never counted or not in 90 days", () => {
    const now = Date.UTC(2026, 9, 28)
    const s = (id: string, products: number, last: string | null): Shelf => ({ id, name: id, categoryId: null, taxonomyKey: null, products, catalog: 0, lastCounted: last, children: [] })
    const due = dueShelves([s("a", 3, null), s("b", 3, "2026-10-01T00:00:00Z"), s("c", 3, "2026-06-01T00:00:00Z"), s("d", 0, null)], now)
    expect(due.map((x) => x.id)).toEqual(["a", "c"])
  })
})
