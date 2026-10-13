import type { SaleLike } from "./topSellers"

// Quick-add reads this device's recent sale payloads from the outbox. Parsing
// up to 300 JSON payloads after every sale/sync is wasted work on the JS
// thread, so parsed payloads are kept by outbox seq (a row's payload never
// changes) and only rows not seen before are read and parsed.

export interface SaleCache {
  bySeq: Map<number, SaleLike | null>
}

export const createSaleCache = (): SaleCache => ({ bySeq: new Map() })

/**
 * Sales for `seqs` (newest first), reading only the payloads the cache hasn't
 * parsed yet via `load`. Rows no longer in `seqs` are dropped from the cache.
 * Unreadable payloads are remembered as null and skipped.
 */
export function recentSalesCached(cache: SaleCache, seqs: number[], load: (missing: number[]) => { seq: number; payload: string }[]): SaleLike[] {
  const missing = seqs.filter((s) => !cache.bySeq.has(s))
  if (missing.length > 0) {
    for (const row of load(missing)) cache.bySeq.set(row.seq, parseSale(row.payload))
    // A seq `load` didn't return (deleted meanwhile) — don't ask again.
    for (const s of missing) if (!cache.bySeq.has(s)) cache.bySeq.set(s, null)
  }
  if (cache.bySeq.size > seqs.length) {
    const keep = new Set(seqs)
    for (const s of cache.bySeq.keys()) if (!keep.has(s)) cache.bySeq.delete(s)
  }
  const out: SaleLike[] = []
  for (const s of seqs) {
    const sale = cache.bySeq.get(s)
    if (sale) out.push(sale)
  }
  return out
}

function parseSale(payload: string): SaleLike | null {
  try {
    const p = JSON.parse(payload) as SaleLike
    return Array.isArray(p?.items) ? p : null
  } catch {
    return null
  }
}
