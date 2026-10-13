import { describe, expect, it } from "vitest"
import { createSaleCache, recentSalesCached } from "../saleCache"

const payload = (id: string) => JSON.stringify({ items: [{ product_id: id, quantity: 1 }] })

describe("recentSalesCached", () => {
  it("parses only rows it hasn't seen and keeps newest-first order", () => {
    const cache = createSaleCache()
    const loads: number[][] = []
    const rows: Record<number, string> = { 1: payload("a"), 2: payload("b"), 3: payload("c") }
    const load = (missing: number[]) => {
      loads.push(missing)
      return missing.map((seq) => ({ seq, payload: rows[seq]! }))
    }
    expect(recentSalesCached(cache, [2, 1], load).map((s) => s.items[0]!.product_id)).toEqual(["b", "a"])
    expect(recentSalesCached(cache, [3, 2, 1], load).map((s) => s.items[0]!.product_id)).toEqual(["c", "b", "a"])
    expect(loads).toEqual([[2, 1], [3]])
    // Nothing new → no load at all.
    recentSalesCached(cache, [3, 2, 1], load)
    expect(loads).toHaveLength(2)
  })

  it("skips unreadable payloads without re-reading them, and forgets dropped rows", () => {
    const cache = createSaleCache()
    let calls = 0
    const load = (missing: number[]) => {
      calls++
      return missing.map((seq) => ({ seq, payload: seq === 5 ? "{not json" : payload("x") }))
    }
    expect(recentSalesCached(cache, [5, 4], load)).toHaveLength(1)
    expect(recentSalesCached(cache, [5, 4], load)).toHaveLength(1)
    expect(calls).toBe(1)
    recentSalesCached(cache, [4], load)
    expect([...cache.bySeq.keys()]).toEqual([4])
  })
})
