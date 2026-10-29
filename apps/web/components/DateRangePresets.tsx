"use client"

import { RANGE_PRESETS, presetOf, rangeFor, type DayRange } from "@/lib/sales/ranges"

// One-tap ranges above the date pickers (Sales, Reports) — two native date
// boxes are slow for the everyday "today" / "this month" questions.
export function DateRangePresets({ value, onChange, className = "" }: {
  value: DayRange
  onChange: (range: DayRange) => void
  className?: string
}) {
  const active = presetOf(value)
  return (
    <div role="group" aria-label="Quick date ranges" className={`flex flex-wrap gap-1.5 ${className}`}>
      {RANGE_PRESETS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={active === key}
          onClick={() => onChange(rangeFor(key))}
          className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
            active === key
              ? "bg-[var(--pt-green)] text-white border-[var(--pt-green)]"
              : "bg-[var(--pt-surface)] text-[var(--pt-text-secondary)] border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
