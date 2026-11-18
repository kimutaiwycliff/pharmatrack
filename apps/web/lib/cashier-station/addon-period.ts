import { addDaysToDay, addMonthsToDay } from "@/lib/billing/period"

// Add-on payments (ADR-021) cover whole months, inclusive Nairobi days.
// Paying on 18 Nov for one month covers 18 Nov – 17 Dec. Paying again while
// still covered continues from the day after the current end, so no day is
// lost or paid twice; paying after a lapse starts again from today.

export function addonCoverage(currentPaidUntil: string | null, today: string, months: number): { start: string; end: string } {
  const start = currentPaidUntil && currentPaidUntil >= today ? addDaysToDay(currentPaidUntil, 1) : today
  return { start, end: addDaysToDay(addMonthsToDay(start, months), -1) }
}

export type AddonStatusView = "none" | "requested" | "active" | "lapsed" | "cancelled"

/** What the owner and operator see, from the stored row. */
export function addonStatusView(row: { status: string; paid_until: string | null } | null | undefined, today: string): AddonStatusView {
  if (!row) return "none"
  if (row.status === "active") return row.paid_until && row.paid_until < today ? "lapsed" : "active"
  return row.status === "requested" ? "requested" : "cancelled"
}
