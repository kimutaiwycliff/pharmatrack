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

// R3: what people read instead of the raw severity keys ("warn"/"serious").
// Variance = counted cash − expected cash, so positive is OVER, negative SHORT.
// Within ±VARIANCE_OK_KES the till counts as balanced.
export type VarianceKind = "balanced" | "over" | "short" | "open"

export interface VarianceLabel {
  kind: VarianceKind
  label: string
  /** Badge colour: balanced → ok, small difference → warning, big → danger. */
  status: "ok" | "warning" | "danger" | "neutral"
}

export function varianceLabel(variance: number | null | undefined, closed = variance != null): VarianceLabel {
  if (!closed || variance == null) return { kind: "open", label: "Open", status: "neutral" }
  const severity = varianceSeverity(variance)
  if (severity === "ok") return { kind: "balanced", label: "Balanced", status: "ok" }
  const status = severity === "serious" ? "danger" : "warning"
  return variance > 0 ? { kind: "over", label: "Over", status } : { kind: "short", label: "Short", status }
}
