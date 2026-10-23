"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, ChevronDown, ChevronRight, Loader2, Minus, Search, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { groupCatalog, quickStartTree, searchGroups, type QsEntry, type QsGroup } from "@pharmatrack/core"
import { Button } from "@/components/ui/button"

// Quick Start step 1 — pick the products you stock from the shared catalogue
// (the everyday curated range + the PPB register), one row per molecule +
// strength + form with the registered brands underneath. Picked products are
// added straight away (inactive until priced); step 2 is prices.

interface CatalogResponse { entries: QsEntry[]; owned: string[]; quick_start_products: number }

const SPECIALIST = "Hospital & Specialist"

function TriBox({ state, label }: { state: "on" | "off" | "some"; label: string }) {
  return (
    <span
      role="checkbox"
      aria-checked={state === "on" ? "true" : state === "some" ? "mixed" : "false"}
      aria-label={label}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${state === "off" ? "border-[var(--pt-border-strong)] bg-[var(--pt-surface)]" : "border-[var(--pt-green)] bg-[var(--pt-green)] text-white"}`}
    >
      {state === "on" ? <Check size={12} strokeWidth={3} /> : state === "some" ? <Minus size={12} strokeWidth={3} /> : null}
    </span>
  )
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "rx" | "ctl" }) {
  const cls = {
    neutral: "bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]",
    green: "bg-[var(--pt-green-50)] text-[var(--pt-green-700)]",
    rx: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    ctl: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  }[tone]
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>
}

export function QuickStartPicker({ onClose, onAdded }: { onClose: () => void; onAdded: (createdIds: string[]) => void }) {
  const { data, isLoading, isError, refetch } = useQuery<CatalogResponse>({
    queryKey: ["quickstart-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/catalog/quickstart")
      if (!res.ok) throw new Error("Couldn't load the catalogue")
      return res.json() as Promise<CatalogResponse>
    },
    staleTime: 60_000,
  })
  const owned = useMemo(() => new Set(data?.owned ?? []), [data])
  const groups = useMemo(() => groupCatalog(data?.entries ?? []), [data])
  const tree = useMemo(() => {
    const t = quickStartTree(groups)
    // Specialist (hospital) medicines last — rarely stocked by a retail pharmacy.
    return [...t.filter((n) => n.category !== SPECIALIST), ...t.filter((n) => n.category === SPECIALIST)]
  }, [groups])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [node, setNode] = useState<{ category: string; sub: string } | null>(null)
  const [openDept, setOpenDept] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [q, setQ] = useState("")
  const [saving, setSaving] = useState(false)

  const current = useMemo(
    () => node ?? (tree[0] ? { category: tree[0].category, sub: tree[0].subcategories[0]?.name ?? "" } : null),
    [node, tree],
  )
  const dept = openDept ?? current?.category ?? null
  const searching = q.trim().length >= 2
  const rows: QsGroup[] = useMemo(() => {
    if (searching) return searchGroups(groups, q.trim())
    return current ? groups.filter((g) => g.category === current.category && g.subcategory === current.sub) : []
  }, [groups, current, q, searching])

  const selectable = (g: QsGroup) => g.entries.filter((e) => !owned.has(e.id))
  const stateOf = (g: QsGroup): "on" | "off" | "some" => {
    const ids = selectable(g).map((e) => e.id)
    const n = ids.filter((id) => selected.has(id)).length
    if (n === 0) return "off"
    // Ticking a row picks one brand; that counts as "on" for the row.
    return n === ids.length || (g.defaultId !== null && selected.has(g.defaultId)) ? "on" : "some"
  }
  const countIn = (pred: (g: QsGroup) => boolean) => groups.filter(pred).reduce((n, g) => n + g.entries.filter((e) => selected.has(e.id)).length, 0)

  function toggle(ids: string[], on: boolean) {
    setSelected((s) => {
      const next = new Set(s)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }
  function toggleGroup(g: QsGroup) {
    const free = selectable(g)
    if (free.length === 0) return
    if (free.some((e) => selected.has(e.id))) { toggle(free.map((e) => e.id), false); return }
    const pick = g.defaultId && !owned.has(g.defaultId) ? g.defaultId : free.length === 1 ? free[0]!.id : null
    if (pick) toggle([pick], true)
    else {
      setExpanded((x) => new Set(x).add(g.key))
      toast.info("Pick the brands you stock", { description: `${g.label} has ${free.length} registered brands.` })
    }
  }
  function selectCommon(list: QsGroup[]) {
    toggle(list.flatMap((g) => (g.defaultId && g.common && !owned.has(g.defaultId) ? [g.defaultId] : [])), true)
  }
  function selectEvery(list: QsGroup[]) {
    toggle(list.flatMap((g) => selectable(g).map((e) => e.id)), true)
  }
  function starterPack() {
    const ids = (data?.entries ?? []).filter((e) => e.source === "curated" && e.price && !owned.has(e.id)).map((e) => e.id)
    toggle(ids, true)
    toast.success(`Starter pack: ${ids.length} everyday products with suggested prices selected`)
  }

  async function add() {
    setSaving(true)
    try {
      const res = await fetch("/api/catalog/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog_ids: [...selected] }),
      })
      const json = (await res.json()) as { created_ids?: string[]; alreadyPresent?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Couldn't add the products")
      const created = json.created_ids ?? []
      toast.success(`Added ${created.length} product${created.length === 1 ? "" : "s"}${json.alreadyPresent ? ` · ${json.alreadyPresent} you already had` : ""}`)
      onAdded(created)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the products")
    } finally {
      setSaving(false)
    }
  }

  const listCommon = rows.filter((g) => g.common && g.defaultId && !owned.has(g.defaultId))
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--pt-surface)]" role="dialog" aria-modal="true" aria-labelledby="qs-title">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--pt-border)] px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id="qs-title" className="flex items-center gap-2 text-base font-bold"><Sparkles size={16} className="text-[var(--pt-green-600)]" /> Quick Start — pick the products you stock</h2>
          <p className="text-xs text-[var(--pt-text-secondary)]">From the PPB register and the everyday pharmacy range. You&apos;ll set prices next; stock comes from your stock take.</p>
        </div>
        <div className="relative order-3 w-full sm:order-none sm:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, brand, molecule or PPB no."
            aria-label="Search the catalogue"
            className="h-10 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          />
        </div>
        <Button variant="outline" onClick={starterPack} disabled={!data} className="h-10 gap-1.5"><Sparkles size={14} /> Starter pack</Button>
        <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)]"><X size={18} /></button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--pt-text-secondary)]"><Loader2 size={18} className="mr-2 animate-spin" /> Loading the catalogue…</div>
      ) : isError || !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm"><p>Couldn&apos;t load the catalogue.</p><Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button></div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          {/* Category tree (a dropdown on phones) */}
          <nav aria-label="Categories" className="hidden min-h-0 overflow-y-auto border-r border-[var(--pt-border)] py-2 md:block">
            {tree.map((d) => {
              const n = countIn((g) => g.category === d.category)
              const isOpen = dept === d.category
              return (
                <div key={d.category}>
                  <button
                    onClick={() => { setOpenDept(isOpen ? "" : d.category); if (!isOpen) setNode({ category: d.category, sub: d.subcategories[0]?.name ?? "" }) }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] font-semibold hover:bg-[var(--pt-muted)]"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="flex-1 truncate">{d.category}</span>
                    {n > 0 && <span className="rounded-full bg-[var(--pt-green)] px-1.5 text-[10px] font-bold text-white">{n}</span>}
                  </button>
                  {isOpen && d.subcategories.map((s) => {
                    const active = !searching && current?.category === d.category && current.sub === s.name
                    const m = countIn((g) => g.category === d.category && g.subcategory === s.name)
                    return (
                      <button
                        key={s.name}
                        onClick={() => { setNode({ category: d.category, sub: s.name }); setQ("") }}
                        className={`flex w-full items-center gap-2 py-1.5 pl-10 pr-4 text-left text-[13px] ${active ? "bg-[var(--pt-green-50)] font-semibold text-[var(--pt-green-700)]" : "text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"}`}
                      >
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="text-[11px] tabular-nums text-[var(--pt-text-tertiary)]">{m > 0 ? `${m} · ` : ""}{s.groups}</span>
                      </button>
                    )
                  })}
                  {isOpen && d.category === SPECIALIST && <p className="px-10 pb-2 text-[11px] text-[var(--pt-text-tertiary)]">Hospital medicines — most retail pharmacies skip these.</p>}
                </div>
              )
            })}
          </nav>

          <section className="flex min-h-0 flex-col">
            <div className="border-b border-[var(--pt-border)] px-4 py-2.5 sm:px-6">
              <select
                className="mb-2 h-9 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 text-sm md:hidden"
                aria-label="Category"
                value={current ? `${current.category}||${current.sub}` : ""}
                onChange={(e) => { const [c, s] = e.target.value.split("||"); setNode({ category: c!, sub: s! }); setQ("") }}
              >
                {tree.map((d) => (
                  <optgroup key={d.category} label={d.category}>
                    {d.subcategories.map((s) => <option key={s.name} value={`${d.category}||${s.name}`}>{s.name} ({s.groups})</option>)}
                  </optgroup>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm font-semibold">
                  {searching ? `${rows.length}${rows.length === 200 ? "+" : ""} matches for “${q.trim()}”` : `${current?.sub} · ${current?.category}`}
                </p>
                {listCommon.length > 0 && <Button variant="outline" size="sm" onClick={() => selectCommon(rows)}>Select common ({listCommon.length})</Button>}
                <Button variant="outline" size="sm" onClick={() => selectEvery(rows)}>Select all</Button>
              </div>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto pb-6">
              {rows.length === 0 && <li className="px-6 py-10 text-center text-sm text-[var(--pt-text-tertiary)]">{searching ? "Nothing matches — try the generic name or a shorter word." : "No products here."}</li>}
              {rows.map((g) => {
                const free = selectable(g)
                const allOwned = free.length === 0
                const isOpen = expanded.has(g.key)
                return (
                  <li key={g.key} className="border-b border-[var(--pt-border)]">
                    <div className={`flex items-center gap-3 px-4 py-2.5 sm:px-6 ${allOwned ? "opacity-60" : ""}`}>
                      <button type="button" onClick={() => toggleGroup(g)} disabled={allOwned} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <TriBox state={allOwned ? "off" : stateOf(g)} label={g.label} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{g.label}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1">
                            {g.common && <Badge tone="green">Common</Badge>}
                            {g.rx && <Badge tone="rx">Rx</Badge>}
                            {g.controlled && <Badge tone="ctl">Controlled</Badge>}
                            {allOwned && <Badge>Already yours</Badge>}
                            {searching && <span className="text-[11px] text-[var(--pt-text-tertiary)]">{g.subcategory} · {g.category}</span>}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpanded((x) => { const n = new Set(x); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })}
                        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"
                        aria-expanded={isOpen}
                      >
                        {g.entries.length} brand{g.entries.length === 1 ? "" : "s"} {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </div>
                    {isOpen && (
                      <ul className="bg-[var(--pt-muted)]/50 pb-1">
                        {g.entries.map((e) => {
                          const mine = owned.has(e.id)
                          return (
                            <li key={e.id}>
                              <button
                                type="button"
                                disabled={mine}
                                onClick={() => toggle([e.id], !selected.has(e.id))}
                                className={`flex w-full items-center gap-3 py-2 pl-12 pr-4 text-left sm:pl-14 ${mine ? "opacity-60" : "hover:bg-[var(--pt-muted)]"}`}
                              >
                                <TriBox state={selected.has(e.id) ? "on" : "off"} label={e.name} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px]">{e.name}{e.strength && !e.name.includes(e.strength.replace(/[^\d.\/]/g, "")) ? ` ${e.strength}` : ""}</span>
                                  <span className="block truncate text-[11px] text-[var(--pt-text-tertiary)]">
                                    {[e.manufacturer, e.ppb ? `PPB ${e.ppb}` : null, e.price ? `~KES ${e.price}` : null].filter(Boolean).join(" · ") || (e.source === "curated" ? "Everyday range" : "")}
                                  </span>
                                </span>
                                {mine ? <Badge>Already yours</Badge> : e.source === "curated" ? <Badge tone="green">Common</Badge> : null}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      )}

      {/* Selection footer */}
      <div className="flex items-center gap-3 border-t border-[var(--pt-border)] px-4 py-3 sm:px-6">
        <p className="text-sm"><span className="font-bold tabular-nums">{selected.size}</span> selected</p>
        {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-xs font-medium text-[var(--pt-text-secondary)] hover:underline">Clear</button>}
        <Button onClick={() => void add()} disabled={selected.size === 0 || saving} className="ml-auto h-10 bg-[var(--pt-green)] text-white hover:bg-[var(--pt-green-600)]">
          {saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
          Add {selected.size || ""} product{selected.size === 1 ? "" : "s"} → set prices
        </Button>
      </div>
    </div>
  )
}
