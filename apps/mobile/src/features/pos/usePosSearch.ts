import { useEffect, useRef, useState } from "react"
import type { ProductRow } from "../../db/schema"
import { currentLimits } from "../../store/cart"
import { quickAddProducts, searchPosProducts } from "./data"

export interface PosProduct extends ProductRow {
  /** What this till may sell: allowance∩stock (online) or cached stock (Offline Edition). */
  sellable: number
}

const DEBOUNCE_MS = 120
const QUICK_ADD_COUNT = 8

const withSellable = (rows: ProductRow[]): PosProduct[] => {
  const limits = currentLimits(rows.map((r) => r.productId))
  return rows.map((r) => ({ ...r, sellable: limits.get(r.productId) ?? 0 }))
}

/**
 * Debounced local search. Each run gets a sequence number and only the latest
 * one may set results, so a slow query for "am" can never overwrite the
 * results for "amox" that finished first. `refreshKey` re-runs it (after a
 * sale, a sync or a top-up) so the "N left" figures stay true.
 */
export function usePosSearch(query: string, refreshKey: unknown) {
  const [results, setResults] = useState<PosProduct[]>([])
  const [quickAdd, setQuickAdd] = useState<PosProduct[]>([])
  const seq = useRef(0)

  useEffect(() => {
    const mine = ++seq.current
    const t = setTimeout(
      () => {
        searchPosProducts(query)
          .then((rows) => {
            if (mine === seq.current) setResults(withSellable(rows))
          })
          .catch(() => {
            if (mine === seq.current) setResults([])
          })
      },
      query.trim() ? DEBOUNCE_MS : 0,
    )
    return () => clearTimeout(t)
  }, [query, refreshKey])

  useEffect(() => {
    let alive = true
    quickAddProducts(QUICK_ADD_COUNT)
      .then((rows) => {
        if (alive) setQuickAdd(withSellable(rows))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [refreshKey])

  return { results, quickAdd }
}
