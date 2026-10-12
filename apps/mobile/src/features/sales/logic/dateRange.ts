import { DAY_MS, nairobiDayStart } from "../../../lib/sync/core/time"

// Sales history date chips → the `from`/`to` instants GET /api/sales filters
// created_at on (gte/lte, apps/web/app/api/sales/route.ts). Day boundaries are
// Nairobi midnights (CLAUDE.md rule 5), sent as exact UTC instants so neither
// the server nor the phone's own timezone setting can shift them. The Offline
// Edition's listLocalSales() takes the same strings (new Date(from)).

export type DateChip = "today" | "yesterday" | "7d" | "30d"

export const DATE_CHIPS: { id: DateChip; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
]

export interface DateRange {
  from: string
  to: string
}

/** "7 days" = today and the 6 days before it (likewise 30). */
export function dateRangeFor(chip: DateChip, nowMs: number): DateRange {
  const todayStart = nairobiDayStart(nowMs)
  const endOfToday = todayStart + DAY_MS - 1
  const iso = (ms: number) => new Date(ms).toISOString()
  switch (chip) {
    case "today":
      return { from: iso(todayStart), to: iso(endOfToday) }
    case "yesterday":
      return { from: iso(todayStart - DAY_MS), to: iso(todayStart - 1) }
    case "7d":
      return { from: iso(todayStart - 6 * DAY_MS), to: iso(endOfToday) }
    case "30d":
      return { from: iso(todayStart - 29 * DAY_MS), to: iso(endOfToday) }
  }
}

/** The chip's range as of right now (computed in event handlers, not render). */
export function currentRange(chip: DateChip): DateRange {
  return dateRangeFor(chip, Date.now())
}
