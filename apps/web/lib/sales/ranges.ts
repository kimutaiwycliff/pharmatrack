import { addDaysToDay, addMonthsToDay, nairobiDay } from "@/lib/billing/period"

// Quick date ranges for Sales and Reports, as Nairobi calendar days
// ("YYYY-MM-DD"). Worked out in Nairobi time: a UTC "today" is still
// yesterday between midnight and 03:00 EAT. Weeks start on Monday.

export type RangePreset = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "last_30"

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_30", label: "Last 30 days" },
]

export interface DayRange { from: string; to: string }

export function rangeFor(preset: RangePreset, now: Date = new Date()): DayRange {
  const today = nairobiDay(now)
  const monthStart = `${today.slice(0, 8)}01`
  switch (preset) {
    case "today": return { from: today, to: today }
    case "yesterday": { const y = addDaysToDay(today, -1); return { from: y, to: y } }
    case "this_week": {
      // getUTCDay of the calendar day: 0 = Sunday → Monday is 6 days back.
      const [yy, mm, dd] = today.split("-").map(Number) as [number, number, number]
      const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()
      return { from: addDaysToDay(today, -((dow + 6) % 7)), to: today }
    }
    case "this_month": return { from: monthStart, to: today }
    case "last_month": {
      const from = addMonthsToDay(monthStart, -1)
      return { from, to: addDaysToDay(monthStart, -1) }
    }
    case "last_30": return { from: addDaysToDay(today, -29), to: today }
  }
}

/** Which preset (if any) a range is — to highlight its button. */
export function presetOf(range: DayRange, now: Date = new Date()): RangePreset | null {
  return RANGE_PRESETS.find((p) => {
    const r = rangeFor(p.key, now)
    return r.from === range.from && r.to === range.to
  })?.key ?? null
}
