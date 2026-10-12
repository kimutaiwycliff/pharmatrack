// R3 date helpers. Display is always Africa/Nairobi (CLAUDE.md rule 5);
// calendar dates the API stores as `YYYY-MM-DD` (expiry, appointment day) are
// built from the picked Date's local parts — the device runs on Nairobi time —
// so a picked "12 Mar" never shifts a day through UTC. Pure (no RN).

export const TZ = "Africa/Nairobi"

const pad = (n: number) => String(n).padStart(2, "0")

/** Local calendar date of `d` as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** YYYY-MM-DD → local midnight Date (null if malformed). */
export function parseISODate(s: string | null | undefined): Date | null {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Today's date in Nairobi as YYYY-MM-DD (matches the server's nairobiToday()). */
export function nairobiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now)
}

/** Whole days from Nairobi-today until a YYYY-MM-DD date (negative = past). */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const a = parseISODate(nairobiToday(now))
  const b = parseISODate(isoDate)
  if (!a || !b) return NaN
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function asDate(v: Date | string): Date {
  if (v instanceof Date) return v
  // Bare calendar dates are local days, not UTC midnights.
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? (parseISODate(v) ?? new Date(NaN)) : new Date(v)
}

/** "12 Mar 2026" */
export function formatDay(v: Date | string): string {
  const d = asDate(v)
  if (Number.isNaN(d.getTime())) return "—"
  const bare = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", ...(bare ? {} : { timeZone: TZ }) })
}

/** "14:05" */
export function formatTime(v: Date | string): string {
  const d = asDate(v)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ })
}

/** "12 Mar 2026, 14:05" */
export function formatDateTime(v: Date | string): string {
  return `${formatDay(v)}, ${formatTime(v)}`
}

/** "Today" / "Tomorrow" / "Yesterday" / "Thu 12 Mar" — section headers for day-grouped lists. */
export function dayLabel(isoDate: string, now: Date = new Date()): string {
  const diff = daysUntil(isoDate, now)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff === -1) return "Yesterday"
  const d = parseISODate(isoDate)
  if (!d) return isoDate
  return d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })
}

/** Nairobi calendar day (YYYY-MM-DD) of an ISO timestamp. */
export function nairobiDayOf(iso: string): string {
  return nairobiToday(new Date(iso))
}
