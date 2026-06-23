// ADR-008 — Money is integer cents in code; numeric(12,2) at the DB boundary.
// No floating-point arithmetic. All adds/multiplies happen on integer cents.

export type Cents = number // integer number of cents (KES)

/** Parse a decimal string/number (e.g. "3.50", 3.5) to integer cents without
 *  float drift. Rounds half-up to the nearest cent. */
export function toCents(amount: string | number): Cents {
  const s = typeof amount === "number" ? amount.toString() : amount.trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid money value: ${amount}`)
  const neg = s.startsWith("-")
  const parts = s.replace("-", "").split(".")
  const whole = parts[0] ?? "0"
  const frac = parts[1] ?? ""
  const cents = BigInt(whole) * BigInt(100) + BigInt((frac + "00").slice(0, 2))
  // round on a 3rd fractional digit if present
  const third = frac.length >= 3 ? Number(frac[2]) : 0
  const rounded = cents + (third >= 5 ? BigInt(1) : BigInt(0))
  const n = Number(rounded)
  return neg ? -n : n
}

/** Format integer cents to a fixed-2 decimal string (e.g. 350 -> "3.50"). */
export function fromCents(cents: Cents): string {
  const neg = cents < 0
  const abs = Math.abs(Math.trunc(cents))
  const s = `${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`
  return neg ? `-${s}` : s
}

/** Display as KES, e.g. 12345600 -> "KES 123,456.00". */
export function formatKES(cents: Cents): string {
  const parts = fromCents(Math.abs(cents)).split(".")
  const whole = parts[0] ?? "0"
  const frac = parts[1] ?? "00"
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${cents < 0 ? "-" : ""}KES ${grouped}.${frac}`
}

/** Apply a discount percent (0–100) to integer cents, rounding half-up. */
export function applyDiscount(cents: Cents, percent: number): Cents {
  if (percent < 0 || percent > 100) throw new Error(`Bad discount %: ${percent}`)
  return cents - Math.round((cents * percent) / 100)
}

/** Sum integer cents safely. */
export function sumCents(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0)
}
