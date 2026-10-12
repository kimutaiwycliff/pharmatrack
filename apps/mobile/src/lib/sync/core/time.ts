// Pure Africa/Nairobi date helpers for the sync engine (no RN imports — these
// run under vitest too). Nairobi is a fixed UTC+3 with no DST, so shifting the
// epoch by 3h and reading the UTC fields gives the local wall clock exactly,
// regardless of what timezone the phone itself is set to (CLAUDE.md §2.5).

export const NAIROBI_OFFSET_MS = 3 * 3_600_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS

export interface NairobiParts {
  year: number
  month: number // 1–12
  day: number
  hour: number
  minute: number
}

export function nairobiParts(ms: number): NairobiParts {
  const d = new Date(ms + NAIROBI_OFFSET_MS)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  }
}

/** YYMMDD of the Nairobi calendar day `ms` falls on (receipt numbers). */
export function nairobiYYMMDD(ms: number): string {
  const p = nairobiParts(ms)
  return `${String(p.year).slice(2)}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`
}

/** Epoch ms of 00:00 Nairobi on the day `ms` falls on. */
export function nairobiDayStart(ms: number): number {
  const p = nairobiParts(ms)
  return Date.UTC(p.year, p.month - 1, p.day) - NAIROBI_OFFSET_MS
}

/** Next Nairobi midnight strictly after `ms` — same as the server's nextNairobiMidnight(). */
export function nextNairobiMidnight(ms: number): number {
  return nairobiDayStart(ms) + DAY_MS
}

/** Epoch ms of hh:mm Nairobi on the day `ms` falls on. */
export function nairobiAt(ms: number, hour: number, minute = 0): number {
  return nairobiDayStart(ms) + hour * HOUR_MS + minute * 60_000
}
