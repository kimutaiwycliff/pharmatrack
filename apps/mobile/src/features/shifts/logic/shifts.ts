import { formatKES } from "@pharmatrack/core"
import { formatDateTime, formatTime, nairobiDayOf } from "../../../lib/dates"
import { varianceLabel } from "../../../lib/shifts/variance"

// R3 shift helpers shared by the Shifts tab, Shift history and Shift detail.
// Pure (no React Native) so they are unit-tested. Field names follow GET
// /api/shifts and /api/shifts/[id] (apps/web/app/api/shifts/**/route.ts +
// apps/web/lib/shifts/serialize.ts). API money is decimal KES; every sum here
// goes through integer cents.

/** The bits of a serialized shift these helpers look at. */
export interface ShiftLike {
  clocked_out_at: string | null
  closing_cash: number | null
}

/** KES decimal (number or numeric string) → integer cents. */
export function kesToCents(v: number | string | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/**
 * Open = not clocked out yet. A force-closed shift has closing_cash null but a
 * clocked_out_at, so it is closed (with no count) — never "Open".
 */
export function isOpenShift(s: ShiftLike): boolean {
  return s.clocked_out_at == null
}

export interface ShiftBadge {
  label: string
  status: "ok" | "warning" | "danger" | "neutral"
}

/**
 * Badge for a shift row: Open / Balanced / Over / Short (varianceLabel), plus
 * "No count" for a shift force-closed without a drawer count — varianceLabel
 * alone would call that one "Open".
 */
export function shiftBadge(s: ShiftLike & { variance: number | null }): ShiftBadge {
  if (isOpenShift(s)) return { label: "Open", status: "neutral" }
  if (s.variance == null) return { label: "No count", status: "neutral" }
  const v = varianceLabel(s.variance, true)
  return { label: v.label, status: v.status }
}

/** Cash that should be in the drawer: opening float + cash taken. */
export function expectedCashCents(openingFloatCents: number, cashSalesCents: number): number {
  return openingFloatCents + cashSalesCents
}

/** Plain-words reading of a variance (counted − expected), in cents. */
export function varianceExplanation(varianceCents: number | null): string {
  if (varianceCents == null) return "No cash count was recorded for this shift."
  if (varianceCents === 0) return "Counted cash matches what was expected."
  const amount = formatKES(Math.abs(varianceCents))
  return varianceCents > 0 ? `Counted ${amount} more than expected.` : `Counted ${amount} less than expected.`
}

/** "12 Mar 2026, 08:00 – 17:30", "… – 13 Mar 2026, 01:10", or "… · still open". */
export function shiftTimeRange(clockedInAt: string, clockedOutAt: string | null): string {
  const start = formatDateTime(clockedInAt)
  if (!clockedOutAt) return `${start} · still open`
  const sameDay = nairobiDayOf(clockedInAt) === nairobiDayOf(clockedOutAt)
  return `${start} – ${sameDay ? formatTime(clockedOutAt) : formatDateTime(clockedOutAt)}`
}

// ── Other people's open shifts (manager force-close) ─────────────────────────

export interface RemoteOpenShift {
  id: string
  staff_id: string
  clocked_in_at: string
  clocked_out_at: string | null
  closing_cash: number | null
}

export interface LocalShiftRef {
  cashierId: string
  /** epoch ms */
  openedAt: number
}

// The server copies a device shift's opened_at verbatim (apps/web/lib/sync/
// push.ts applyShiftOpen), so a shift that started on THIS phone shows up on
// the server with the same cashier and (to the second) the same start time.
const SAME_SHIFT_WINDOW_MS = 60_000

/**
 * Server-side open shifts a manager may force-close from here: not the current
 * person's own, and not ones that live on this phone (those are closed locally
 * so the close goes through the sync outbox instead of racing it).
 */
export function remoteOpenShifts<T extends RemoteOpenShift>(server: T[], local: LocalShiftRef[], currentStaffId: string | null | undefined): T[] {
  return server.filter((s) => {
    if (!isOpenShift(s)) return false
    if (currentStaffId && s.staff_id === currentStaffId) return false
    const opened = new Date(s.clocked_in_at).getTime()
    return !local.some((l) => l.cashierId === s.staff_id && Math.abs(l.openedAt - opened) <= SAME_SHIFT_WINDOW_MS)
  })
}

/** Optional typed cash amount: blank → cents null, invalid → ok false. */
export function parseOptionalCash(text: string): { ok: true; cents: number | null } | { ok: false } {
  const t = text.replace(/,/g, "").trim()
  if (!t) return { ok: true, cents: null }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false }
  return { ok: true, cents: Math.round(Number(t) * 100) }
}
