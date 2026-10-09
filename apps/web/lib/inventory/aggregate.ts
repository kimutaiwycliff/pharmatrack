// "All branches" view of the per-branch product_stock rows: one row per
// product, stock and batch counts summed, earliest expiry across branches.
interface StockRow {
  product_id: string | null
  branch_id: string | null
  stock_on_hand: number | null
  batch_count: number | null
  earliest_expiry: string | null
}

export function mergeAcrossBranches<T extends StockRow>(rows: T[]): T[] {
  const byProduct = new Map<string, T>()
  for (const r of rows) {
    if (!r.product_id) continue
    const prev = byProduct.get(r.product_id)
    if (!prev) {
      byProduct.set(r.product_id, { ...r, branch_id: null })
      continue
    }
    prev.stock_on_hand = (prev.stock_on_hand ?? 0) + (r.stock_on_hand ?? 0)
    prev.batch_count = (prev.batch_count ?? 0) + (r.batch_count ?? 0)
    if (r.earliest_expiry && (!prev.earliest_expiry || r.earliest_expiry < prev.earliest_expiry)) {
      prev.earliest_expiry = r.earliest_expiry
    }
  }
  return [...byProduct.values()]
}

/** Branch the request should be scoped to: a branch-locked user is always
 *  their own branch; anyone else gets the requested branch, or null = all. */
export function resolveBranchScope(ctx: { branchLocked: boolean; branchId: string | null }, requested: string | null): string | null {
  if (ctx.branchLocked) return ctx.branchId
  return requested && requested !== "all" ? requested : null
}
