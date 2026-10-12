import { daysUntil } from "../../../lib/dates"

// Expiry bucketing for batches and inventory rows. Same 90-day window as
// apps/web/app/api/inventory/route.ts (EXPIRY_WARN_DAYS) and the colours of
// web's BatchesSheet: expired = red, within 90 days = amber, else neutral/ok.
// Days are counted from Nairobi-today (lib/dates.ts), not UTC.

export const EXPIRY_WARN_DAYS = 90

export type ExpiryKind = "expired" | "soon" | "ok" | "unknown"

export interface ExpiryInfo {
  kind: ExpiryKind
  /** Whole days until expiry (negative = past); null when there's no date. */
  days: number | null
  /** StatusBadge status / Text tone to colour it with. */
  status: "danger" | "warning" | "ok" | "neutral"
  label: string
}

export function expiryInfo(isoDate: string | null | undefined, now: Date = new Date()): ExpiryInfo {
  if (!isoDate) return { kind: "unknown", days: null, status: "neutral", label: "No expiry date" }
  const days = daysUntil(isoDate.slice(0, 10), now)
  if (Number.isNaN(days)) return { kind: "unknown", days: null, status: "neutral", label: "No expiry date" }
  if (days < 0) return { kind: "expired", days, status: "danger", label: "Expired" }
  const label = days === 0 ? "Expires today" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`
  if (days <= EXPIRY_WARN_DAYS) return { kind: "soon", days, status: "warning", label }
  return { kind: "ok", days, status: "ok", label }
}
