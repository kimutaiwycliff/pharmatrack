// Ported from apps/web/lib/shifts/variance.ts (read directly, not from memory)
// so mobile agrees with web on what counts as "fine" vs "needs a recount" vs
// "needs explaining" — same thresholds, same severity buckets.
export const VARIANCE_OK_KES = 50
export const VARIANCE_SERIOUS_KES = 500

export type VarianceSeverity = "ok" | "warn" | "serious"

export function varianceSeverity(variance: number | null | undefined): VarianceSeverity | null {
  if (variance == null) return null
  const abs = Math.abs(variance)
  if (abs >= VARIANCE_SERIOUS_KES) return "serious"
  if (abs >= VARIANCE_OK_KES) return "warn"
  return "ok"
}
