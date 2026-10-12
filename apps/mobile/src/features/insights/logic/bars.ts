// Bar heights for the plain-View charts (no chart library): the tallest value
// fills 100% of the track and the rest scale against it. A non-zero value
// never shrinks below a visible sliver, and zero / negative / non-numeric
// values get no bar. Pure (no RN).

export const MIN_VISIBLE_PERCENT = 2

export function barPercents(values: readonly number[]): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const max = Math.max(0, ...clean)
  if (max <= 0) return clean.map(() => 0)
  return clean.map((v) => (v <= 0 ? 0 : Math.min(100, Math.max(MIN_VISIBLE_PERCENT, (v / max) * 100))))
}
