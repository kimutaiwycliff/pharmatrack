// First-expiry-first-out order for a product's batches — the order the POS
// sells them in (packages/core FEFO), so the list reads top-down as "what goes
// next". The API already sorts by expiry_date; this keeps the order stable
// when rows are merged (all branches) or patched locally, and puts batches
// without a date last. Ties: older receipt first, then batch number.

export interface FefoBatch {
  expiry_date: string | null
  received_at?: string | null
  batch_number?: string | null
}

export function sortFefo<T extends FefoBatch>(batches: readonly T[]): T[] {
  return [...batches].sort((a, b) => {
    const ea = a.expiry_date?.slice(0, 10) ?? ""
    const eb = b.expiry_date?.slice(0, 10) ?? ""
    if (ea !== eb) {
      if (!ea) return 1
      if (!eb) return -1
      return ea < eb ? -1 : 1
    }
    const ra = a.received_at ?? ""
    const rb = b.received_at ?? ""
    if (ra !== rb) return ra < rb ? -1 : 1
    return (a.batch_number ?? "").localeCompare(b.batch_number ?? "")
  })
}

/** Total units left across batches (base units). */
export function totalRemaining(batches: readonly { quantity_remaining: number }[]): number {
  return batches.reduce((s, b) => s + (b.quantity_remaining ?? 0), 0)
}
