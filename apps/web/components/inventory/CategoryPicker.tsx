"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Sparkles, X } from "lucide-react"
import type { CategorySuggestion } from "@pharmatrack/core"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  buildCategoryOptions, categoryLabel, optionForSuggestion, type CategoryOption, type TenantCategory,
} from "@pharmatrack/core"

// One searchable field for category + subcategory: the pharmacy's own
// categories plus the PharmaTrack defaults it hasn't used yet (created when
// the product is saved). Typing "peni" or "antib" finds "Penicillins ·
// Antibiotics & Infections"; one pick sets both levels. A suggestion (from the
// catalogue or the product's name) shows as a chip until it's used or changed.

const RECENT_KEY = "pt.recentCategories"

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : []
  } catch {
    return []
  }
}
function pushRecent(value: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([value, ...readRecent().filter((v) => v !== value)].slice(0, 5)))
  } catch {
    // private mode — recents are a convenience only
  }
}

/**
 * Every typed word must appear in the subcategory or department name (no
 * letter-scatter fuzzy matching). Word-start matches on the subcategory rank
 * first, then anywhere in it, then department-only matches.
 */
export function categoryFilter(_value: string, search: string, keywords?: string[]): number {
  const q = search.trim().toLowerCase()
  if (!q) return 1
  const [label = "", group = ""] = (keywords ?? []).map((k) => k.toLowerCase())
  const terms = q.split(/\s+/)
  if (!terms.every((t) => label.includes(t) || group.includes(t))) return 0
  const words = label.split(/[^a-z0-9]+/)
  if (terms.every((t) => words.some((w) => w.startsWith(t)))) return 1
  if (terms.every((t) => label.includes(t))) return 0.7
  return 0.4
}

export function useTenantCategories() {
  return useQuery<TenantCategory[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await fetch("/api/categories")
      if (!res.ok) return []
      return ((await res.json()) as { categories: TenantCategory[] }).categories ?? []
    },
    staleTime: 60_000,
  })
}

export interface CategoryPickerProps {
  /** A category id, "default:<key>" or null (uncategorised). */
  value: string | null
  onChange: (value: string | null) => void
  /** Shown as a one-tap chip while it differs from the value. */
  suggestion?: CategorySuggestion | null
  /** Why the current value was filled in for the user ("from the catalogue"); cleared by the parent on edit. */
  autoFilledFrom?: string | null
  disabled?: boolean
  id?: string
}

export function CategoryPicker({ value, onChange, suggestion, autoFilledFrom, disabled, id }: CategoryPickerProps) {
  const { data: tenant = [], isLoading } = useTenantCategories()
  const [open, setOpen] = useState(false)
  const options = useMemo(() => buildCategoryOptions(tenant), [tenant])
  const groups = useMemo(() => {
    const m = new Map<string, CategoryOption[]>()
    for (const o of options) m.set(o.group, [...(m.get(o.group) ?? []), o])
    return [...m.entries()]
  }, [options])
  const recent = useMemo(
    () => (open ? readRecent().map((v) => options.find((o) => o.value === v)).filter((o): o is CategoryOption => !!o) : []),
    [open, options],
  )

  const label = categoryLabel(value, options, tenant)
  const suggested = suggestion ? optionForSuggestion(options, tenant, suggestion) : null
  const showChip = !!suggestion && !!suggested && suggested !== value

  function pick(v: string | null) {
    onChange(v)
    if (v) pushRecent(v)
    setOpen(false)
  }

  const item = (o: CategoryOption, prefix = "") => (
    <CommandItem
      key={prefix + o.value}
      value={prefix + o.value}
      keywords={[o.label, o.group]}
      onSelect={() => pick(o.value)}
      className="flex items-center gap-2"
    >
      <Check size={14} className={o.value === value ? "opacity-100 text-[var(--pt-green-600)]" : "opacity-0"} />
      <span className="truncate">{o.label}</span>
      {prefix && <span className="ml-auto text-xs text-[var(--pt-text-tertiary)] truncate">{o.group}</span>}
    </CommandItem>
  )

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          disabled={disabled || isLoading}
          aria-label="Category"
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-3 text-left text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] disabled:opacity-60"
        >
          <span className={`flex-1 truncate ${label ? "" : "text-[var(--pt-text-tertiary)]"}`}>{label ?? "Uncategorised — choose a category"}</span>
          {label && autoFilledFrom && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[var(--pt-green-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--pt-green-600)]">
              <Sparkles size={11} /> Auto-filled
            </span>
          )}
          <ChevronsUpDown size={14} className="shrink-0 text-[var(--pt-text-tertiary)]" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,var(--anchor-width,22rem))] min-w-[18rem] p-0">
          <Command loop filter={categoryFilter}>
            <CommandInput placeholder="Search categories…" autoFocus />
            <CommandList className="max-h-72">
              <CommandEmpty>No matching category. Add your own under Products → Categories.</CommandEmpty>
              {value && (
                <CommandGroup>
                  <CommandItem value="none" keywords={["Uncategorised", "none clear"]} onSelect={() => pick(null)} className="text-[var(--pt-text-secondary)]">
                    <X size={14} /> Uncategorised
                  </CommandItem>
                </CommandGroup>
              )}
              {recent.length > 0 && <CommandGroup heading="Recently used">{recent.map((o) => item(o, "recent:"))}</CommandGroup>}
              {groups.map(([group, items]) => (
                <CommandGroup key={group} heading={group}>{items.map((o) => item(o))}</CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {autoFilledFrom && label && <p className="text-[11px] text-[var(--pt-text-tertiary)]">Filled in {autoFilledFrom} — change it if you shelve it elsewhere.</p>}

      {showChip && suggestion && (
        <button
          type="button"
          onClick={() => pick(suggested)}
          disabled={disabled}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-[var(--pt-green)] px-2.5 py-1 text-xs text-[var(--pt-green-600)] hover:bg-[var(--pt-green-50)] transition-colors"
        >
          <Sparkles size={12} className="shrink-0" />
          <span className="truncate">
            Suggested: <span className="font-semibold">{suggestion.subcategory}</span> · {suggestion.category}
            {suggestion.reason && <span className="text-[var(--pt-text-tertiary)]"> — {suggestion.reason}</span>}
          </span>
          <span className="shrink-0 font-semibold">Use</span>
        </button>
      )}
    </div>
  )
}
