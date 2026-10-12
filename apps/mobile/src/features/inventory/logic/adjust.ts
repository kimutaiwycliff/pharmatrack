// Stock adjustment rules — mirrors apps/web/components/inventory/BatchesSheet.tsx's
// REASONS table and POST /api/inventory/adjust's schema ({ batch_id, mode:
// "set" | "delta", value: int, reason, note? }). Each reason decides what the
// number means: a re-count sets the batch to that quantity, a write-off
// removes units, a customer return adds them. The server rejects a result
// below zero or no change, so the form blocks those first.

export const ADJUST_REASONS = ["count_correction", "damage", "expiry", "theft_loss", "return", "other"] as const
export type AdjustReason = (typeof ADJUST_REASONS)[number]

export interface ReasonConfig {
  label: string
  mode: "set" | "delta"
  sign: 1 | -1
  /** Label for the quantity field. */
  verb: string
}

export const REASON_CONFIG: Record<AdjustReason, ReasonConfig> = {
  count_correction: { label: "Count correction", mode: "set", sign: 1, verb: "Counted quantity" },
  damage: { label: "Damage / breakage", mode: "delta", sign: -1, verb: "Units removed" },
  expiry: { label: "Expired write-off", mode: "delta", sign: -1, verb: "Units removed" },
  theft_loss: { label: "Theft / loss", mode: "delta", sign: -1, verb: "Units removed" },
  return: { label: "Customer return", mode: "delta", sign: 1, verb: "Units returned" },
  other: { label: "Other", mode: "set", sign: 1, verb: "New quantity" },
}

/** What the quantity field starts at when a reason is picked (web resets it the same way). */
export function defaultQuantityText(reason: AdjustReason, remaining: number): string {
  return REASON_CONFIG[reason].mode === "set" ? String(remaining) : ""
}

export interface AdjustPlan {
  /** Batch quantity after saving (null when the input isn't a whole number yet). */
  newRemaining: number | null
  /** Signed change in base units. */
  delta: number
  error: string | null
  /** Ready to submit. */
  valid: boolean
  /** Body for POST /api/inventory/adjust (without batch_id / note). */
  body: { mode: "set" | "delta"; value: number; reason: AdjustReason } | null
}

export function planAdjustment(remaining: number, reason: AdjustReason, quantityText: string): AdjustPlan {
  const cfg = REASON_CONFIG[reason]
  const t = quantityText.replace(/,/g, "").trim()
  if (!/^\d+$/.test(t)) {
    return { newRemaining: null, delta: 0, error: t ? "Enter a whole number" : null, valid: false, body: null }
  }
  const n = Number(t)
  const newRemaining = cfg.mode === "set" ? n : remaining + cfg.sign * n
  const delta = newRemaining - remaining
  if (newRemaining < 0) {
    return { newRemaining, delta, error: `Can't remove more than the ${remaining} left in this batch`, valid: false, body: null }
  }
  if (delta === 0) {
    return { newRemaining, delta, error: cfg.mode === "set" ? "That's already the quantity" : "Enter how many units", valid: false, body: null }
  }
  return {
    newRemaining,
    delta,
    error: null,
    valid: true,
    body: { mode: cfg.mode, value: cfg.mode === "set" ? n : cfg.sign * n, reason },
  }
}
