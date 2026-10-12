import { parseISODate } from "../../../lib/dates"

// Chart axis labels for Nairobi calendar days / months the APIs already
// grouped server-side. Bare dates are parsed as local calendar days (the
// device runs on Nairobi time), never through UTC. Pure (no RN).

/** "2026-03-12" → "Thu" */
export function weekdayLabel(isoDate: string): string {
  const d = parseISODate(isoDate)
  return d ? d.toLocaleDateString("en-KE", { weekday: "short" }) : isoDate
}

/** "2026-03-12" → "12 Mar" */
export function shortDayLabel(isoDate: string): string {
  const d = parseISODate(isoDate)
  return d ? d.toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : isoDate
}

/** "2026-03" → "Mar 2026" */
export function monthLabel(month: string): string {
  const d = parseISODate(`${month}-01`)
  return d ? d.toLocaleDateString("en-KE", { month: "short", year: "numeric" }) : month
}
