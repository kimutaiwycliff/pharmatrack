import { useCallback, useEffect, useRef, useState } from "react"
import type { ProductRow } from "../../db/schema"
import { currentLimits } from "../../store/cart"
import { quickAddProducts, searchPosProducts } from "./data"

export interface PosProduct extends ProductRow {
  /** What this till may sell: allowance∩stock (online) or cached stock (Offline Edition). */
  sellable: number
}

const DEBOUNCE_MS = 120
const QUICK_ADD_COUNT = 8
const SEARCH_FAILED = "Couldn't load products on this phone. Tap Retry — if it keeps happening, restart the app."

const withSellable = (rows: ProductRow[]): PosProduct[] => {
  const limits = currentLimits(rows.map((r) => r.productId))
  return rows.map((r) => ({ ...r, sellable: limits.get(r.productId) ?? 0 }))
}

/**
 * Debounced local search. Each run gets a sequence number and only the latest
 * one may set results, so a slow query for "am" can never overwrite the
 * results for "amox" that finished first. `refreshKey` re-runs it (after a
 * sale, a sync or a top-up) so the "N left" figures stay true.
 *
 * A failed read sets `error` (the list then shows it with a Retry, never a
 * misleading "No products match"); `retry` runs both reads again.
 */
export function usePosSearch(query: string, refreshKey: unknown) {
  const [results, setResults] = useState<PosProduct[]>([])
  const [quickAdd, setQuickAdd] = useState<PosProduct[]>([])
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const seq = useRef(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    const mine = ++seq.current
    const t = setTimeout(
      () => {
        searchPosProducts(query)
          .then((rows) => {
            if (mine !== seq.current) return
            setResults(withSellable(rows))
            setError(null)
          })
          .catch((err: unknown) => {
            if (mine !== seq.current) return
            if (__DEV__) console.warn("[pos search]", err)
            setResults([])
            setError(SEARCH_FAILED)
          })
      },
      query.trim() ? DEBOUNCE_MS : 0,
    )
    return () => clearTimeout(t)
  }, [query, refreshKey, attempt])

  useEffect(() => {
    let alive = true
    quickAddProducts(QUICK_ADD_COUNT)
      .then((rows) => {
        if (alive) setQuickAdd(withSellable(rows))
      })
      .catch((err: unknown) => {
        // Quick add is a shortcut — the full list (and its error) still shows.
        if (__DEV__) console.warn("[pos quick add]", err)
      })
    return () => {
      alive = false
    }
  }, [refreshKey, attempt])

  return { results, quickAdd, error, retry }
}
