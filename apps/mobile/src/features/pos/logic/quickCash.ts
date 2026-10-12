// Quick-cash buttons on the payment sheet: "Exact" first, then the next
// round amount above the total for each common note/coin size.

export const CASH_STEPS_KES = [50, 100, 200, 500, 1000] as const

/** Cents values: [exact, …next round amounts strictly above the total], ascending and unique. */
export function quickCashOptions(totalCents: number, steps: readonly number[] = CASH_STEPS_KES): number[] {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return []
  const out = [totalCents]
  for (const kes of steps) {
    const step = kes * 100
    const next = Math.ceil(totalCents / step) * step
    const above = next === totalCents ? next + step : next
    if (!out.includes(above)) out.push(above)
  }
  return [out[0]!, ...out.slice(1).sort((a, b) => a - b)]
}

/** Change due (positive) or shortfall (negative), cents. */
export const changeCents = (tenderedCents: number, totalCents: number) => tenderedCents - totalCents
