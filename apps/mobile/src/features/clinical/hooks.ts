import { useEffect, useRef, useState } from "react"
import type { ProductRow } from "../../db/schema"
import { searchPosProducts } from "../pos/data"
import { searchCustomers } from "./data"
import type { CustomerHit } from "./types"

// Debounced lookups for the clinical forms. Each run gets a sequence number
// and only the latest may set results (a slow "jo" can't overwrite "john").
// State is only set from timer/promise callbacks, never synchronously in the
// effect body (react-hooks/set-state-in-effect).

/**
 * Local catalogue search — the same SQLite query the POS uses
 * (features/pos/data.ts), so the prescription drug picker works offline.
 */
export function useLocalProductSearch(query: string, enabled: boolean): ProductRow[] {
  const [results, setResults] = useState<ProductRow[]>([])
  const seq = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const mine = ++seq.current
    const t = setTimeout(
      () => {
        searchPosProducts(query)
          .then((rows) => {
            if (mine === seq.current) setResults(rows)
          })
          .catch(() => {
            if (mine === seq.current) setResults([])
          })
      },
      query.trim() ? 150 : 0,
    )
    return () => clearTimeout(t)
  }, [query, enabled])
  return results
}

/** Existing-customer suggestions while typing a name or phone (2+ characters). */
export function useCustomerSearch(query: string, enabled: boolean): CustomerHit[] {
  const [state, setState] = useState<{ q: string; hits: CustomerHit[] }>({ q: "", hits: [] })
  const seq = useRef(0)
  const q = query.trim()
  const active = enabled && q.length >= 2
  useEffect(() => {
    if (!active) return
    const mine = ++seq.current
    const t = setTimeout(() => {
      searchCustomers(q)
        .then((hits) => {
          if (mine === seq.current) setState({ q, hits })
        })
        .catch(() => {
          // Suggestions are a convenience — typing a new customer still works.
          if (mine === seq.current) setState({ q, hits: [] })
        })
    }, 250)
    return () => clearTimeout(t)
  }, [q, active])
  return active ? state.hits : []
}

/** `value`, settled for `ms` (search boxes that hit the server). */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}
