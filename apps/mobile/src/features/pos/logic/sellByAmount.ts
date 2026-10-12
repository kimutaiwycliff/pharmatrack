// "Customer wants KES 20 worth" → whole base units (mirrors web CartLine's
// SellByAmount). A fractional sale would be untrue, so when the amount
// doesn't divide evenly the cashier picks the nearest whole quantity.

export interface AmountOption {
  units: number
  cents: number
}

export type SellByAmountResult =
  | { kind: "empty" }
  | { kind: "tooSmall"; unitPriceCents: number }
  | { kind: "exact"; options: [AmountOption] }
  | { kind: "between"; options: AmountOption[] }

export function sellByAmount(amountCents: number, unitPriceCents: number): SellByAmountResult {
  if (!Number.isFinite(amountCents) || amountCents <= 0 || unitPriceCents <= 0) return { kind: "empty" }
  if (amountCents < unitPriceCents) return { kind: "tooSmall", unitPriceCents }
  const lower = Math.floor(amountCents / unitPriceCents)
  if (lower * unitPriceCents === amountCents) return { kind: "exact", options: [{ units: lower, cents: amountCents }] }
  const upper = lower + 1
  return {
    kind: "between",
    options: [
      { units: lower, cents: lower * unitPriceCents },
      { units: upper, cents: upper * unitPriceCents },
    ],
  }
}
