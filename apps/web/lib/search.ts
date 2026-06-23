// pg_trgm similarity threshold for fuzzy (typo-tolerant) search. Lower = fuzzier
// (more recall, more noise); higher = stricter. Resolution order:
//   ?threshold= request override  →  SEARCH_SIMILARITY_THRESHOLD env  →  0.3
// Clamped to a sane range so a request can't (e.g.) set it to 0 and match all.
export function searchThreshold(param?: string | null): number {
  const env = Number(process.env.SEARCH_SIMILARITY_THRESHOLD)
  const base = Number.isFinite(env) && env > 0 ? env : 0.3
  const override = param != null && param !== "" ? Number(param) : Number.NaN
  const val = Number.isFinite(override) ? override : base
  // Clamp [0.1, 0.8], round to 2dp (the value is inlined into a SET statement).
  return Math.min(0.8, Math.max(0.1, Math.round(val * 100) / 100))
}
