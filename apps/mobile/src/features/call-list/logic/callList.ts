import { nairobiAt } from "../../../lib/sync/core/time"

// Appointment reminders without SMS: staff phone the client. Mirrors
// apps/web/components/dashboard/ClientsToCallCard.tsx over
// GET /api/appointments/call-list. Pure (no React Native) so it's unit-tested.

export type ContactOutcome = "called" | "no_answer"
export type CallAction = ContactOutcome | "confirmed"

export interface CallRow {
  id: string
  scheduled_at: string
  status: string
  service_label: string | null
  customer: { full_name: string; phone: string | null }
  assigned: { id: string; name: string | null } | null
  branch_name: string | null
  contact_outcome: ContactOutcome | null
  contacted_at: string | null
}

export interface CallList {
  today: CallRow[]
  tomorrow: CallRow[]
  sms_enabled: boolean
  /** Clients to call tomorrow (appointments the day after) — server count. */
  next_day_to_call?: number
}

export interface CallSection {
  key: "tomorrow" | "today"
  title: string
  rows: CallRow[]
}

/** Confirmed, or someone already got through — nothing left to do. */
export function isDone(r: CallRow): boolean {
  return r.status === "confirmed" || r.contact_outcome === "called"
}

/** "Confirmed" / "Called" for done rows, null otherwise. */
export function doneLabel(r: CallRow): string | null {
  if (r.status === "confirmed") return "Confirmed"
  if (r.contact_outcome === "called") return "Called"
  return null
}

/** Tomorrow's bookings nobody has phoned yet (the badge count) — same rule as web. */
export function toCallCount(list: CallList): number {
  return list.tomorrow.filter((r) => r.status === "scheduled" && !r.contact_outcome).length
}

export function hasRows(list: CallList | undefined | null): boolean {
  return !!list && (list.today.length > 0 || list.tomorrow.length > 0)
}

/** "Tomorrow — call today" first (the work), then "Today" (for reference). Empty sections drop out. */
export function callSections(list: CallList): CallSection[] {
  const sections: CallSection[] = [
    { key: "tomorrow", title: "Tomorrow — call today", rows: list.tomorrow },
    { key: "today", title: "Today", rows: list.today },
  ]
  return sections.filter((s) => s.rows.length > 0)
}

/** "Depo-Provera · with Jane · Westlands" / "unassigned". */
export function rowSubtitle(r: CallRow): string {
  return [r.service_label, r.assigned?.name ? `with ${r.assigned.name}` : "unassigned", r.branch_name].filter(Boolean).join(" · ")
}

/** tel: URL for the dialer (keeps digits and a leading +). */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}

export function actionToast(action: CallAction, customerName: string): string {
  if (action === "confirmed") return `${customerName} confirmed`
  if (action === "called") return "Marked as called"
  return "Marked as no answer — try again later"
}

/** Patch a row locally after a successful action (before the refetch lands). */
export function applyAction(list: CallList, id: string, action: CallAction, nowIso: string): CallList {
  const patch = (r: CallRow): CallRow => {
    if (r.id !== id) return r
    if (action === "confirmed") return { ...r, status: "confirmed" }
    return { ...r, contact_outcome: action, contacted_at: nowIso }
  }
  return { ...list, today: list.today.map(patch), tomorrow: list.tomorrow.map(patch) }
}

// ── Morning phone notification ──────────────────────────────────────────────

export const MORNING_HOUR = 7
export const MORNING_MINUTE = 30

export function callNotificationBody(n: number): string {
  return `${n} client${n === 1 ? "" : "s"} to call today about tomorrow's appointments`
}

export interface CallNotificationPlan {
  /** Epoch ms to fire at (07:30 Nairobi today). */
  at: number
  count: number
}

/**
 * What to schedule after a successful fetch at `now`. The list's "tomorrow"
 * rows are the calls for the Nairobi day `now` falls on, so:
 * - before 07:30 Nairobi → fire at 07:30 today with the rows still to call;
 * - from 07:30 on → tomorrow's 07:30 would be about the day after tomorrow,
 *   which this list doesn't cover, so nothing is scheduled (cancel) rather
 *   than show a wrong number. The next fetch before 07:30 schedules it.
 * Zero rows to call → null (cancel).
 */
export function planCallNotification(list: CallList, now: number): CallNotificationPlan | null {
  const today = nairobiAt(now, MORNING_HOUR, MORNING_MINUTE)
  // Before 07:30: today's notification, counting tomorrow's rows still to call.
  if (now < today) {
    const count = toCallCount(list)
    return count > 0 ? { at: today, count } : null
  }
  // From 07:30: tomorrow's notification, counting the server's figure for the
  // day after (appointments booked later just refresh it on the next fetch).
  const count = list.next_day_to_call ?? 0
  return count > 0 ? { at: today + 86_400_000, count } : null
}
