import { dayLabel, nairobiDayOf, nairobiToday } from "../../../lib/dates"

// Pure appointment helpers behind the Appointments tab and the booking form
// (no React Native imports — vitest runs these in node). Range bounds and the
// day grouping mirror apps/web/app/(dashboard)/appointments/page.tsx, but group
// by the Africa/Nairobi calendar day explicitly instead of the device clock.

export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show"
export type AppointmentRange = "today" | "upcoming" | "past"
export type StatusFilter = "all" | AppointmentStatus
/** Same keys as components/StatusBadge's BadgeStatus (kept local so this file stays RN-free). */
export type BadgeKind = "ok" | "warning" | "danger" | "neutral"

export const RANGES: { key: AppointmentRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
]

// The appointment.status enum in apps/web/app/api/appointments/[id]/route.ts.
export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "no_show", label: "No-show" },
]

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
}

export function statusBadge(status: string): { status: BadgeKind; label: string } {
  switch (status) {
    case "confirmed":
      return { status: "ok", label: STATUS_LABEL.confirmed }
    case "completed":
      return { status: "neutral", label: STATUS_LABEL.completed }
    case "cancelled":
      return { status: "danger", label: STATUS_LABEL.cancelled }
    case "no_show":
      return { status: "warning", label: STATUS_LABEL.no_show }
    default:
      return { status: "neutral", label: STATUS_LABEL.scheduled }
  }
}

const TERMINAL = new Set(["completed", "cancelled", "no_show"])

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status)
}

export type AppointmentAction = "confirm" | "complete" | "no_show" | "cancel" | "reschedule"

/** What web's AppointmentCard offers for a status (plus reschedule/edit). Terminal = nothing. */
export function availableActions(status: string): AppointmentAction[] {
  if (isTerminal(status)) return []
  const out: AppointmentAction[] = []
  if (status === "scheduled") out.push("confirm")
  out.push("complete", "reschedule", "no_show", "cancel")
  return out
}

export const ACTION_STATUS: Record<Exclude<AppointmentAction, "reschedule">, AppointmentStatus> = {
  confirm: "confirmed",
  complete: "completed",
  no_show: "no_show",
  cancel: "cancelled",
}

const DAY_MS = 86_400_000
// Nairobi is UTC+3 all year (no DST), so a calendar day starts at 00:00+03:00.
const nairobiMidnight = (isoDay: string) => new Date(`${isoDay}T00:00:00+03:00`)

/** from/to (ISO) for a range tab, in Nairobi days — same windows as web's dayBounds(). */
export function rangeBounds(range: AppointmentRange, now: Date = new Date()): { from?: string; to?: string } {
  const start = nairobiMidnight(nairobiToday(now))
  const tomorrow = new Date(start.getTime() + DAY_MS)
  if (range === "today") return { from: start.toISOString(), to: new Date(tomorrow.getTime() - 1).toISOString() }
  if (range === "upcoming") return { from: tomorrow.toISOString() }
  return { to: start.toISOString() }
}

export type DayListRow<T> =
  | { kind: "header"; key: string; day: string; label: string; count: number }
  | { kind: "item"; key: string; item: T }

/**
 * Flattens appointments into header + item rows for one FlashList, grouped by
 * the Nairobi day of `scheduled_at`. Input is ascending (as the API returns
 * it); `newestFirst` reverses it first (web's Past tab shows recent first).
 */
export function groupByNairobiDay<T extends { id: string; scheduled_at: string }>(
  items: T[],
  opts: { newestFirst?: boolean; now?: Date } = {},
): DayListRow<T>[] {
  const ordered = [...items].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))
  if (opts.newestFirst) ordered.reverse()
  const rows: DayListRow<T>[] = []
  let header: Extract<DayListRow<T>, { kind: "header" }> | null = null
  for (const item of ordered) {
    const day = nairobiDayOf(item.scheduled_at)
    if (!header || header.day !== day) {
      header = { kind: "header", key: `h-${day}`, day, label: dayLabel(day, opts.now), count: 0 }
      rows.push(header)
    }
    header.count += 1
    rows.push({ kind: "item", key: item.id, item })
  }
  return rows
}

/** When the next dose falls due: the visit time plus `weeks` weeks (null for one-off services). */
export function nextDoseDate(scheduledAt: Date | string, weeks: number | null | undefined): Date | null {
  if (!weeks || weeks <= 0) return null
  const base = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt
  if (Number.isNaN(base.getTime())) return null
  return new Date(base.getTime() + weeks * 7 * DAY_MS)
}

export function recurrenceHint(weeks: number | null | undefined): string | null {
  if (!weeks || weeks <= 0) return null
  return weeks === 1 ? "Repeats every week" : `Repeats every ${weeks} weeks`
}

/** Default booking time: the next whole hour (web's toLocalInput() default). */
export function defaultBookingTime(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  return d
}

// ── Booking form validation ─────────────────────────────────────────────────

export interface BookingInput {
  customerName: string
  phone: string
  email: string
  serviceSlug: string | null
  scheduledAt: Date | null
  duration: string
  notes: string
  /** Editing an existing appointment: the customer can't change. */
  editing?: boolean
}

export type BookingErrors = Partial<Record<"customerName" | "phone" | "email" | "service" | "scheduledAt" | "duration" | "notes", string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Field errors for the booking form, matching the server's Zod limits. Empty = valid. */
export function validateBooking(input: BookingInput): BookingErrors {
  const e: BookingErrors = {}
  if (!input.editing) {
    const name = input.customerName.trim()
    if (!name) e.customerName = "Customer name is required"
    else if (name.length > 120) e.customerName = "Keep the name under 120 characters"
    const phone = input.phone.trim()
    if (phone) {
      const digits = phone.replace(/\D/g, "").length
      if (digits < 9 || digits > 15 || phone.length > 40) e.phone = "Enter a valid phone number, e.g. 0712 345 678"
    }
    const email = input.email.trim()
    if (email && (!EMAIL_RE.test(email) || email.length > 120)) e.email = "Enter a valid email address"
  }
  if (!input.serviceSlug) e.service = "Choose a service"
  if (!input.scheduledAt || Number.isNaN(input.scheduledAt.getTime())) e.scheduledAt = "Pick a date and time"
  const dur = input.duration.trim()
  if (!/^\d+$/.test(dur) || Number(dur) < 5 || Number(dur) > 480) e.duration = "Between 5 and 480 minutes"
  if (input.notes.length > 1000) e.notes = "Keep notes under 1,000 characters"
  return e
}

export const hasErrors = (e: object): boolean => Object.values(e).some(Boolean)
