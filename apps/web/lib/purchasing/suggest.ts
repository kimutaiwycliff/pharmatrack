// Restock suggestion maths — pure so it can be unit-tested and explained in
// the UI ("sold 3/day · 30 days' cover · 2 strips already on order").
//
//   avg daily demand = units sold in the look-back window ÷ window days
//   target stock     = avg daily × days of cover + reorder level (safety buffer)
//   need             = target − on hand − already on order
//
// An item is suggested when it's at/below its reorder level, or when on-hand +
// on-order won't cover the chosen number of days. Quantities round UP to whole
// packs (you can't order 3.4 boxes).

export interface SuggestInput {
  stockOnHand: number
  reorderLevel: number
  /** Base units sold in the look-back window. */
  soldInWindow: number
  windowDays: number
  coverDays: number
  /** Base units on open POs not yet received. */
  onOrder: number
  unitsPerPack: number
}

export type SuggestReason = "out_of_stock" | "low_stock" | "demand"

export interface Suggestion {
  avgDaily: number
  targetUnits: number
  needUnits: number
  packs: number
  reason: SuggestReason | null
}

export function suggestRestock(i: SuggestInput): Suggestion {
  const avgDaily = i.windowDays > 0 ? i.soldInWindow / i.windowDays : 0
  const demandUnits = Math.ceil(avgDaily * i.coverDays)
  const targetUnits = demandUnits + i.reorderLevel
  const available = i.stockOnHand + i.onOrder
  const needUnits = Math.max(0, targetUnits - available)

  let reason: SuggestReason | null = null
  if (i.stockOnHand <= 0) reason = "out_of_stock"
  else if (i.stockOnHand <= i.reorderLevel) reason = "low_stock"
  else if (available < demandUnits) reason = "demand"

  // Already covered by what's on order → nothing to add, even if low today.
  if (needUnits === 0) return { avgDaily, targetUnits, needUnits, packs: 0, reason: null }
  if (reason === null) return { avgDaily, targetUnits, needUnits, packs: 0, reason: null }

  const upp = Math.max(1, i.unitsPerPack)
  return { avgDaily, targetUnits, needUnits, packs: Math.max(1, Math.ceil(needUnits / upp)), reason }
}

/** PO-2610-00042 — year+month and a global sequence (like receipt numbers). */
export function formatPoNumber(seq: number, now = new Date()): string {
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
  return `PO-${yymm}-${String(seq).padStart(5, "0")}`
}
