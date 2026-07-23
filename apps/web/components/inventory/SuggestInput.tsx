"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"

interface SuggestInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  id?: string
  className?: string
}

/**
 * Free-text input with an autocomplete dropdown drawn from `suggestions` — lets
 * the user pick a known value OR type any custom one of their own. Unlike a
 * <select>, the typed value is never restricted to the suggestion list.
 */
export function SuggestInput({ value, onChange, suggestions, placeholder, id, className }: SuggestInputProps) {
  const [open, setOpen] = useState(false)
  const q = value.trim().toLowerCase()
  const filtered = suggestions.filter((s) => s.toLowerCase() !== q && (q ? s.toLowerCase().includes(q) : true))

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-lg">
          {filtered.slice(0, 20).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--pt-muted)] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
