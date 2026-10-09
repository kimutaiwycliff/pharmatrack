"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus, Search, Sparkles, Trash2, Truck, Minus, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useBranchScope } from "@/lib/hooks/useBranchScope"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { useCan } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { formatKES } from "@/lib/store/cartStore"
import type { RestockSuggestion } from "@/lib/purchasing/serialize"
import type { ProductWithStock } from "@pharmatrack/types"

interface Line {
  product_id: string
  name: string
  strength: string | null
  base_unit: string
  pack_label: string | null
  units_per_pack: number
  packs: number
  cost: number | null // per pack
  supplier_id: string | null
  included: boolean
  hint: string | null
  reason: RestockSuggestion["reason"] | "manual"
}

const REASON: Record<Line["reason"], { label: string; cls: string }> = {
  out_of_stock: { label: "Out of stock", cls: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300" },
  low_stock: { label: "Low", cls: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  demand: { label: "Selling fast", cls: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  manual: { label: "Added", cls: "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]" },
}

const NO_SUPPLIER = "__none__"
const selectCls = "h-9 rounded-lg border border-[var(--pt-border)] px-2 bg-[var(--pt-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"

function fromSuggestion(s: RestockSuggestion): Line {
  const parts = [
    `${s.stock_on_hand} ${s.base_unit}s on hand`,
    s.avg_daily > 0 ? `sells ${s.avg_daily}/day` : "no recent sales",
    s.on_order > 0 ? `${s.on_order} on order` : null,
  ].filter(Boolean)
  return {
    product_id: s.product_id, name: s.name, strength: s.strength, base_unit: s.base_unit,
    pack_label: s.pack_label, units_per_pack: s.units_per_pack, packs: s.suggested_packs,
    cost: s.cost_per_pack, supplier_id: s.supplier_id, included: true, hint: parts.join(" · "), reason: s.reason,
  }
}

export default function RestockPlannerPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { branchId, branches, ready } = useBranchScope()
  const setActiveBranch = useUIStore((s) => s.setActiveBranch)
  const canSeeCost = useCan("cost.view")

  const [windowDays, setWindowDays] = useState(30)
  const [coverDays, setCoverDays] = useState(30)
  const [costBasis, setCostBasis] = useState<"last" | "avg">("last")
  // Lines the user has edited/added, keyed by product. Suggestions fill in the rest.
  const [edits, setEdits] = useState<Record<string, Line>>({})
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [expected, setExpected] = useState("")
  const [creating, setCreating] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useQuery<{ suggestions: RestockSuggestion[] }>({
    queryKey: ["restock-suggestions", branchId, windowDays, coverDays, costBasis],
    enabled: !!branchId,
    queryFn: async () => {
      const qs = new URLSearchParams({ branch_id: branchId!, window: String(windowDays), cover: String(coverDays), cost: costBasis })
      const res = await fetch(`/api/purchase-orders/suggestions?${qs}`)
      if (!res.ok) throw new Error("Failed to load suggestions")
      return res.json() as Promise<{ suggestions: RestockSuggestion[] }>
    },
  })

  const { data: supplierData } = useQuery<{ suppliers: Array<{ id: string; name: string }> }>({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const res = await fetch("/api/suppliers")
      return res.ok ? (res.json() as Promise<{ suppliers: Array<{ id: string; name: string }> }>) : { suppliers: [] }
    },
    staleTime: 5 * 60_000,
  })
  const suppliers = useMemo(() => supplierData?.suppliers ?? [], [supplierData])
  const supplierName = (id: string | null) => (id ? suppliers.find((s) => s.id === id)?.name ?? "Supplier" : "No supplier yet")

  const lines: Line[] = useMemo(() => {
    const base = (data?.suggestions ?? []).map(fromSuggestion)
    const map = new Map(base.map((l) => [l.product_id, l]))
    for (const [id, l] of Object.entries(edits)) map.set(id, l)
    return [...map.values()].filter((l) => !removed.has(l.product_id))
  }, [data, edits, removed])

  const groups = useMemo(() => {
    const nameOf = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "Supplier"
    const g = new Map<string, Line[]>()
    for (const l of lines) {
      const key = l.supplier_id ?? NO_SUPPLIER
      g.set(key, [...(g.get(key) ?? []), l])
    }
    // Named suppliers first, "no supplier" last.
    return [...g.entries()].sort(([a], [b]) => (a === NO_SUPPLIER ? 1 : b === NO_SUPPLIER ? -1 : nameOf(a).localeCompare(nameOf(b))))
  }, [lines, suppliers])

  const lineTotal = (l: Line) => (l.cost == null ? 0 : l.cost * l.packs)
  const groupTotal = (ls: Line[]) => ls.filter((l) => l.included).reduce((s, l) => s + lineTotal(l), 0)
  const grandTotal = groups.reduce((s, [, ls]) => s + groupTotal(ls), 0)
  const includedGroups = groups.filter(([, ls]) => ls.some((l) => l.included))

  function update(id: string, patch: Partial<Line>) {
    const current = lines.find((l) => l.product_id === id)
    if (!current) return
    setEdits((e) => ({ ...e, [id]: { ...current, ...patch } }))
  }

  function addProduct(p: ProductWithStock) {
    const id = p.product_id || (p as { id?: string }).id
    if (!id) return
    if (lines.some((l) => l.product_id === id)) {
      toast.info(`${p.name} is already on the list`)
      return
    }
    const upp = p.units_per_pack ?? 1
    setRemoved((r) => { const n = new Set(r); n.delete(id); return n })
    setEdits((e) => ({
      ...e,
      [id]: {
        product_id: id, name: p.name ?? "Item", strength: p.strength ?? null, base_unit: p.base_unit ?? "unit",
        pack_label: p.pack_label ?? null, units_per_pack: upp, packs: 1,
        cost: p.cost_price != null ? Math.round(p.cost_price * upp * 100) / 100 : null,
        supplier_id: null, included: true, hint: `${p.stock_on_hand ?? 0} ${p.base_unit ?? "unit"}s on hand`, reason: "manual",
      },
    }))
  }

  async function createOrders(keys: string[]) {
    const todo = includedGroups.filter(([k]) => keys.includes(k))
    if (todo.length === 0) return
    setCreating(keys.length === 1 ? keys[0]! : "all")
    const created: string[] = []
    try {
      for (const [key, ls] of todo) {
        const items = ls.filter((l) => l.included && l.packs > 0).map((l) => ({
          product_id: l.product_id, quantity_ordered: l.packs, units_per_pack: l.units_per_pack,
          pack_label: l.pack_label, ...(canSeeCost ? { unit_cost: l.cost } : {}),
        }))
        if (items.length === 0) continue
        const res = await fetch("/api/purchase-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: branchId, supplier_id: key === NO_SUPPLIER ? null : key,
            expected_date: expected || null, items,
          }),
        })
        const json = (await res.json()) as { id?: string; error?: string }
        if (!res.ok || !json.id) throw new Error(json.error ?? "Failed to create order")
        created.push(json.id)
        setRemoved((r) => new Set([...r, ...ls.map((l) => l.product_id)]))
      }
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] })
      void qc.invalidateQueries({ queryKey: ["restock-suggestions"] })
      if (created.length === 1) {
        toast.success("Draft order created — review it, then send it to the supplier")
        router.push(`/purchase-orders/${created[0]}`)
      } else if (created.length > 1) {
        toast.success(`${created.length} draft orders created, one per supplier`)
        router.push("/purchase-orders")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create order")
    } finally {
      setCreating(null)
    }
  }

  if (!ready) return null
  if (!branchId) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-6">
        <h1 className="text-lg font-bold">Which branch are you restocking?</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1 mb-4">Suggestions use that branch&apos;s stock and sales.</p>
        <div className="space-y-2">
          {branches.map((b) => (
            <button key={b.id} onClick={() => setActiveBranch(b.id)}
              className="w-full text-left px-4 py-3 rounded-lg border border-[var(--pt-border)] hover:border-[var(--pt-green)] hover:bg-[var(--pt-green-50)] text-sm font-semibold transition-colors">
              {b.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24">
      <div className="flex items-start gap-3 mb-5">
        <button onClick={() => router.push("/purchase-orders")} aria-label="Back"
          className="w-8 h-8 mt-0.5 rounded-md flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Sparkles size={20} className="text-[var(--pt-green)]" /> Restock planner</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            Items that are low or won&apos;t last, sized from recent sales and grouped by supplier. Adjust anything, then create draft orders.
          </p>
        </div>
      </div>

      {/* Planning knobs */}
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
          Based on sales from the last
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className={`${selectCls} w-full mt-1 normal-case tracking-normal font-normal`}>
            {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
          Order enough for
          <select value={coverDays} onChange={(e) => setCoverDays(Number(e.target.value))} className={`${selectCls} w-full mt-1 normal-case tracking-normal font-normal`}>
            {[7, 14, 21, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        {canSeeCost && (
          <label className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
            Budget using
            <select value={costBasis} onChange={(e) => setCostBasis(e.target.value as "last" | "avg")} className={`${selectCls} w-full mt-1 normal-case tracking-normal font-normal`}>
              <option value="last">Last purchase cost</option>
              <option value="avg">Average cost (6 months)</option>
            </select>
          </label>
        )}
        <label className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
          Delivery needed by
          <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className="h-9 mt-1 normal-case tracking-normal font-normal" />
        </label>
      </div>

      <AddProductBar branchId={branchId} onAdd={addProduct} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] py-14 px-6 text-center">
          <p className="font-semibold">Nothing needs restocking for {coverDays} days</p>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Try a longer cover period, or add products manually above.</p>
        </div>
      ) : (
        <div className={`space-y-4 ${isFetching ? "opacity-70 transition-opacity" : ""}`}>
          {groups.map(([key, ls]) => (
            <section key={key} className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-[var(--pt-muted)] border-b border-[var(--pt-border)]">
                <div className="flex items-center gap-2 min-w-0">
                  <Truck size={16} className="text-[var(--pt-text-secondary)] shrink-0" />
                  <span className="font-semibold truncate">{supplierName(key === NO_SUPPLIER ? null : key)}</span>
                  <span className="text-xs text-[var(--pt-text-secondary)]">{ls.filter((l) => l.included).length} items</span>
                </div>
                <div className="flex items-center gap-3">
                  {canSeeCost && <span className="text-sm font-semibold tabular-nums">{formatKES(groupTotal(ls))}</span>}
                  <Button size="sm" variant="outline" disabled={!!creating || !ls.some((l) => l.included)} onClick={() => createOrders([key])}>
                    {creating === key ? <Loader2 size={14} className="animate-spin" /> : "Create draft"}
                  </Button>
                </div>
              </header>
              {key === NO_SUPPLIER && (
                <p className="px-4 sm:px-5 py-2 text-xs text-[var(--pt-text-secondary)] flex items-center gap-1.5 border-b border-[var(--pt-border)]">
                  <Info size={13} /> Pick a supplier for these items below, or create the order without one and set it later.
                </p>
              )}
              <div className="divide-y divide-[var(--pt-border)]">
                {ls.map((l) => (
                  <div key={l.product_id} className={`px-4 sm:px-5 py-3 ${l.included ? "" : "opacity-50"}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={l.included} onChange={(e) => update(l.product_id, { included: e.target.checked })}
                        className="mt-1 accent-[var(--pt-green)]" aria-label={`Include ${l.name}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{l.name}{l.strength ? ` ${l.strength}` : ""}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${REASON[l.reason].cls}`}>{REASON[l.reason].label}</span>
                        </div>
                        {l.hint && <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">{l.hint}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => update(l.product_id, { packs: Math.max(1, l.packs - 1) })} aria-label="Fewer"
                              className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-[var(--pt-muted)]"><Minus size={13} /></button>
                            <input value={l.packs} inputMode="numeric" aria-label="Packs to order"
                              onChange={(e) => update(l.product_id, { packs: Math.max(1, parseInt(e.target.value.replace(/\D/g, "") || "1", 10)) })}
                              className="w-14 h-8 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-center text-sm font-semibold tabular-nums" />
                            <button onClick={() => update(l.product_id, { packs: l.packs + 1 })} aria-label="More"
                              className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-[var(--pt-muted)]"><Plus size={13} /></button>
                          </div>
                          <span className="text-xs text-[var(--pt-text-secondary)]">
                            × {l.pack_label ?? (l.units_per_pack > 1 ? `pack of ${l.units_per_pack}` : l.base_unit)}
                            {l.units_per_pack > 1 ? ` = ${(l.packs * l.units_per_pack).toLocaleString()} ${l.base_unit}s` : ""}
                          </span>
                          {canSeeCost && (
                            <label className="flex items-center gap-1 text-xs text-[var(--pt-text-secondary)]">
                              @ KES
                              <input type="number" min={0} step="0.01" value={l.cost ?? ""} placeholder="cost"
                                onChange={(e) => update(l.product_id, { cost: e.target.value === "" ? null : Number(e.target.value) })}
                                className="w-24 h-8 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 text-sm tabular-nums" />
                              /pack
                            </label>
                          )}
                          <select value={l.supplier_id ?? NO_SUPPLIER} onChange={(e) => update(l.product_id, { supplier_id: e.target.value === NO_SUPPLIER ? null : e.target.value })}
                            className={`${selectCls} h-8 text-xs max-w-44`} aria-label="Supplier">
                            <option value={NO_SUPPLIER}>No supplier</option>
                            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {canSeeCost && <span className="text-sm font-semibold tabular-nums">{l.cost == null ? "—" : formatKES(lineTotal(l))}</span>}
                        <button onClick={() => setRemoved((r) => new Set([...r, l.product_id]))} aria-label={`Remove ${l.name}`}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-[var(--pt-red)]">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Sticky budget bar */}
      {includedGroups.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-30 border-t border-[var(--pt-border)] bg-[var(--pt-surface)]/95 backdrop-blur px-4 sm:px-7 pt-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
          <div className="flex items-center justify-between gap-3 max-w-6xl">
            <div>
              <p className="text-xs text-[var(--pt-text-secondary)]">{includedGroups.length} supplier{includedGroups.length === 1 ? "" : "s"} · {lines.filter((l) => l.included).length} items</p>
              {canSeeCost && <p className="text-lg font-bold tabular-nums">Budget {formatKES(grandTotal)}</p>}
            </div>
            <Button onClick={() => createOrders(includedGroups.map(([k]) => k))} disabled={!!creating} className="gap-2">
              {creating === "all" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {includedGroups.length === 1 ? "Create draft order" : `Create ${includedGroups.length} draft orders`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Search the catalogue and add anything the planner didn't suggest. */
function AddProductBar({ branchId, onAdd }: { branchId: string; onAdd: (p: ProductWithStock) => void }) {
  const [q, setQ] = useState("")
  const debounced = useDebounce(q, 250)
  const { data, isFetching } = useQuery<{ products: ProductWithStock[] }>({
    queryKey: ["po-add-search", branchId, debounced],
    enabled: debounced.trim().length >= 2,
    queryFn: async () => {
      const qs = new URLSearchParams({ q: debounced.trim(), branch_id: branchId, context: "receive" })
      const res = await fetch(`/api/products/search?${qs}`)
      return res.ok ? (res.json() as Promise<{ products: ProductWithStock[] }>) : { products: [] }
    },
  })
  const results = debounced.trim().length >= 2 ? (data?.products ?? []).slice(0, 8) : []
  return (
    <div className="relative mb-4">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add another product to order…" className="pl-9 h-10" />
      {isFetching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--pt-text-tertiary)]" />}
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] shadow-lg overflow-hidden">
          {results.map((p) => (
            <button key={p.product_id} onClick={() => { onAdd(p); setQ("") }}
              className="w-full text-left px-4 py-2.5 hover:bg-[var(--pt-muted)] flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{p.name}{p.strength ? ` ${p.strength}` : ""}</span>
              <span className="text-xs text-[var(--pt-text-secondary)] shrink-0">{p.stock_on_hand ?? 0} on hand</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
