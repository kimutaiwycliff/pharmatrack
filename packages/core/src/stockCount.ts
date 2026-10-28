// Stock take, shelf by shelf (ADR-020) — the pure parts: packs + loose units,
// what a counted line changes, and whether a session can post without a
// manager. Shared by the API (posting) and the web/Android count screens
// (the live "differences" bar), so both agree on every number.

/** A difference this small (units, either way) may post without approval… */
export const STOCK_COUNT_SMALL_UNITS = 2
/** …as long as it is also worth no more than this at cost (KES). */
export const STOCK_COUNT_SMALL_VALUE = 1000

/** "3 boxes + 14 tabs" → base units. */
export function toBaseUnits(packs: number, loose: number, unitsPerPack: number): number {
  const upp = Math.max(1, Math.floor(unitsPerPack || 1))
  return Math.max(0, Math.floor(packs || 0)) * upp + Math.max(0, Math.floor(loose || 0))
}

/** Base units → { packs, loose } for showing a count back. */
export function splitUnits(total: number, unitsPerPack: number): { packs: number; loose: number } {
  const upp = Math.max(1, Math.floor(unitsPerPack || 1))
  const t = Math.max(0, Math.floor(total || 0))
  return { packs: Math.floor(t / upp), loose: t % upp }
}

/**
 * What a counted line does to stock. `expected` is the recorded quantity at the
 * moment the line was counted (null for a batch the system didn't know).
 */
export function countDelta(counted: number, expected: number | null): number {
  return counted - (expected ?? 0)
}

/**
 * The batch's quantity after posting: the counted difference applied to the
 * quantity *now*, so sales made since the line was counted still come off.
 */
export function applyCount(current: number, counted: number, expected: number | null): number {
  return Math.max(0, current + countDelta(counted, expected))
}

export interface CountLineFacts {
  kind: "batch" | "new_batch" | "new_product"
  counted: number
  expected: number | null
  /** Cost per base unit, if known (batch cost, else product cost). */
  unitCost: number | null
  controlled: boolean
  /** Setup lines: a selling price was confirmed for this product. */
  priceConfirmed?: boolean
}

export interface CountSummary {
  counted: number
  /** Lines on known batches whose quantity changes. */
  changed: number
  unitsFound: number
  unitsMissing: number
  valueFound: number
  valueMissing: number
  newBatches: number
  newProducts: number
  /** New products whose price wasn't confirmed (created inactive). */
  unpriced: number
  /** Why a manager must approve (empty = can post as is). */
  approvalReasons: string[]
}

export function summariseCount(lines: readonly CountLineFacts[]): CountSummary {
  const s: CountSummary = {
    counted: lines.length, changed: 0, unitsFound: 0, unitsMissing: 0, valueFound: 0, valueMissing: 0,
    newBatches: 0, newProducts: 0, unpriced: 0, approvalReasons: [],
  }
  let big = 0, controlled = 0
  for (const l of lines) {
    if (l.kind === "new_product") {
      s.newProducts++
      if (!l.priceConfirmed) s.unpriced++
      continue
    }
    if (l.kind === "new_batch") {
      if (l.counted > 0) s.newBatches++
      continue
    }
    const d = countDelta(l.counted, l.expected)
    if (d === 0) continue
    s.changed++
    const value = Math.abs(d) * (l.unitCost ?? 0)
    if (d > 0) { s.unitsFound += d; s.valueFound += value }
    else { s.unitsMissing -= d; s.valueMissing += value }
    if (Math.abs(d) > STOCK_COUNT_SMALL_UNITS || value > STOCK_COUNT_SMALL_VALUE) big++
    if (l.controlled) controlled++
  }
  s.valueFound = Math.round(s.valueFound * 100) / 100
  s.valueMissing = Math.round(s.valueMissing * 100) / 100
  if (big) s.approvalReasons.push(`${big} difference${big === 1 ? "" : "s"} over ${STOCK_COUNT_SMALL_UNITS} units or KES ${STOCK_COUNT_SMALL_VALUE.toLocaleString("en-KE")}`)
  if (controlled) s.approvalReasons.push(`${controlled} controlled drug${controlled === 1 ? "" : "s"} changed`)
  return s
}

/** Month picker ("2027-06") → last day of that month ("2027-06-30"). */
export function expiryMonthEnd(ym: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`
}
