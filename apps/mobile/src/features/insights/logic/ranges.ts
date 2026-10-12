import { nairobiToday } from "../../../lib/dates"

// Report date ranges as Nairobi calendar days (YYYY-MM-DD), the format
// apps/web/app/api/reports/route.ts takes for `from`/`to` (both inclusive).
// Calendar arithmetic is done on the date string through UTC so the device's
// own offset can never shift a day. Pure (no RN).

export type RangePreset = "today" | "7d" | "30d" | "month"

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
]

export interface DayRange {
  from: string
  to: string
}

/** YYYY-MM-DD plus `n` calendar days (n may be negative). */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** The from/to days for a preset, ending today in Nairobi. */
export function presetRange(preset: RangePreset, now: Date = new Date()): DayRange {
  const to = nairobiToday(now)
  switch (preset) {
    case "today":
      return { from: to, to }
    case "7d":
      return { from: addDays(to, -6), to }
    case "30d":
      return { from: addDays(to, -29), to }
    case "month":
      return { from: `${to.slice(0, 8)}01`, to }
  }
}

/** The last `n` Nairobi days, oldest first (the dashboard's 7-day series). */
export function lastNDays(n: number, now: Date = new Date()): string[] {
  const today = nairobiToday(now)
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))
}

/** Message for an impossible custom range, or null when it's fine. */
export function validateRange(range: DayRange): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) return "Choose both dates"
  if (range.from > range.to) return "The start date must be on or before the end date"
  return null
}

/**
 * Whole-day instants for the Offline Edition's local repo, which compares
 * `new Date(from/to)` against sale timestamps: start of `from` and end of `to`
 * in Nairobi (UTC+3, no DST), so the last day is included like the server does.
 */
export function nairobiBounds(range: DayRange): { fromIso: string; toIso: string } {
  return { fromIso: `${range.from}T00:00:00.000+03:00`, toIso: `${range.to}T23:59:59.999+03:00` }
}
