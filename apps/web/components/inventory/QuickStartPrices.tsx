"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Download, Loader2, PackagePlus, Percent, Search, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

// Quick Start step 2 — prices for the products just picked (or every Quick
// Start product, from the banner): units per pack, cost per pack, selling
// price per unit. Products without a price stay off sale ("Needs a price").
// Step 3 — done: stock comes from a stock take with batch numbers + expiry.

interface Row {
  product_id: string; name: string; brand_name: string | null; strength: string | null; dosage_form: string | null
  base_unit: string; pack_label: string | null; units_per_pack: number; is_active: boolean
  cost_price: number | null; selling_price: number | null
}
interface Edit { units: string; packCost: string; sell: string }

const num = (s: string) => { const v = Number(s); return Number.isFinite(v) && s.trim() !== "" ? v : null }
const money = (n: number) => String(Math.round(n * 100) / 100)

export function QuickStartPrices({ ids, onClose }: { ids?: string[]; onClose: () => void }) {
  const qc = useQueryClient()
  const key = ids?.length ? ids.join(",") : ""
  const { data, isLoading } = useQuery<{ products: Row[]; can_edit_cost: boolean }>({
    queryKey: ["quickstart-prices", key],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/review${key ? `?ids=${key}` : ""}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [q, setQ] = useState("")
  const [markup, setMarkup] = useState("30")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ priced: number; unpriced: number } | null>(null)

  const rows = useMemo(() => data?.products ?? [], [data])
  const editOf = (r: Row): Edit => edits[r.product_id] ?? {
    units: String(r.units_per_pack || 1),
    packCost: r.cost_price != null ? money(r.cost_price * (r.units_per_pack || 1)) : "",
    sell: r.selling_price && r.selling_price > 0 ? money(r.selling_price) : "",
  }
  const setEdit = (r: Row, patch: Partial<Edit>) => setEdits((e) => ({ ...e, [r.product_id]: { ...editOf(r), ...patch } }))
  const shown = q.trim() ? rows.filter((r) => `${r.name} ${r.brand_name ?? ""} ${r.strength ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : rows
  const priced = rows.filter((r) => (num(editOf(r).sell) ?? 0) > 0).length

  function applyMarkup() {
    const m = num(markup)
    if (m == null || m < 0) { toast.error("Enter a markup %, e.g. 30"); return }
    let n = 0
    const next = { ...edits }
    for (const r of rows) {
      const e = editOf(r)
      const units = Math.max(1, Math.round(num(e.units) ?? 1))
      const cost = num(e.packCost)
      if (cost && !(num(e.sell) ?? 0)) { next[r.product_id] = { ...e, sell: money((cost / units) * (1 + m / 100)) }; n++ }
    }
    setEdits(next)
    toast.success(n ? `Priced ${n} product${n === 1 ? "" : "s"} at cost + ${m}%` : "No rows with a cost and no price")
  }

  async function save() {
    const items = rows.flatMap((r) => {
      const e = edits[r.product_id]
      if (!e) return []
      const units = Math.max(1, Math.round(num(e.units) ?? 1))
      const pack = num(e.packCost)
      const sell = num(e.sell)
      return [{
        id: r.product_id, units_per_pack: units,
        ...(data?.can_edit_cost ? { cost_price: pack == null ? null : Math.round((pack / units) * 100) / 100 } : {}),
        ...(sell != null ? { selling_price: sell, is_active: sell > 0 } : {}),
      }]
    })
    setBusy(true)
    try {
      if (items.length) {
        const res = await fetch("/api/catalog/review", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(json.error ?? "Couldn't save prices")
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"] }), qc.invalidateQueries({ queryKey: ["inventory"] }),
        qc.invalidateQueries({ queryKey: ["catalog-seed-status"] }), qc.invalidateQueries({ queryKey: ["quickstart-prices"] }),
      ])
      setDone({ priced, unpriced: rows.length - priced })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save prices")
    } finally {
      setBusy(false)
    }
  }

  const cell = "h-9 w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="qsp-title">
      <div className="flex h-full w-full max-w-5xl flex-col bg-[var(--pt-surface)] sm:h-[90vh] sm:rounded-2xl sm:shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--pt-border)] px-5 py-3">
          <div>
            <h2 id="qsp-title" className="text-base font-bold">{done ? "You're set up" : "Set your prices"}</h2>
            {!done && <p className="text-xs text-[var(--pt-text-secondary)]">Cost per pack from your invoice, selling price per unit. Leave a price blank to set it later — that product stays off sale until then.</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)]"><X size={18} /></button>
        </div>

        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <CheckCircle2 size={44} className="text-[var(--pt-green-600)]" />
            <div>
              <p className="text-lg font-semibold">{done.priced} product{done.priced === 1 ? "" : "s"} ready to sell</p>
              {done.unpriced > 0 && <p className="text-sm text-[var(--pt-text-secondary)]">{done.unpriced} still need a price — find them under Products → “Needs a price”.</p>}
            </div>
            <div className="max-w-md rounded-xl border border-[var(--pt-border)] p-4 text-left">
              <p className="text-sm font-semibold">Next: your stock take</p>
              <p className="mt-0.5 text-xs text-[var(--pt-text-secondary)]">Count what&apos;s on the shelves and record each batch with its expiry date, so first-expiry-first-out and expiry alerts work from day one.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/inventory/receive" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pt-green)] px-3 text-sm font-semibold text-white hover:bg-[var(--pt-green-600)]"><PackagePlus size={15} /> Receive stock</Link>
                <Link href="/products?export=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--pt-border)] px-3 text-sm font-semibold hover:bg-[var(--pt-muted)]"><Download size={15} /> Export a count sheet</Link>
              </div>
            </div>
            <Button variant="outline" onClick={onClose}>Done</Button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--pt-text-secondary)]"><Loader2 size={18} className="mr-2 animate-spin" /> Loading…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--pt-border)] px-5 py-2.5">
              <div className="relative mr-auto w-full sm:w-64">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" aria-label="Find a product"
                  className="h-9 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]" />
              </div>
              {data?.can_edit_cost && (
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-[var(--pt-text-secondary)]">Markup</span>
                  <div className="relative w-20">
                    <input value={markup} onChange={(e) => setMarkup(e.target.value)} inputMode="decimal" aria-label="Markup percent" className={`${cell} pr-6`} />
                    <Percent size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
                  </div>
                  <Button variant="outline" size="sm" onClick={applyMarkup}>Fill empty prices</Button>
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--pt-muted)] text-[11px] uppercase tracking-wide text-[var(--pt-text-secondary)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Product</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">Units / pack</th>
                    {data?.can_edit_cost && <th className="w-32 px-2 py-2 text-right font-semibold">Cost / pack</th>}
                    <th className="w-32 px-2 py-2 text-right font-semibold">Price / unit</th>
                    {data?.can_edit_cost && <th className="w-20 px-4 py-2 text-right font-semibold">Margin</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const e = editOf(r)
                    const units = Math.max(1, Math.round(num(e.units) ?? 1))
                    const packCost = num(e.packCost)
                    const unitCost = packCost != null ? packCost / units : null
                    const sell = num(e.sell)
                    const margin = unitCost != null && sell ? Math.round(((sell - unitCost) / sell) * 100) : null
                    return (
                      <tr key={r.product_id} className="border-b border-[var(--pt-border)]">
                        <td className="px-4 py-1.5">
                          <p className="font-medium">{r.name}{r.strength && !r.name.toLowerCase().includes(r.strength.toLowerCase()) ? ` ${r.strength}` : ""}</p>
                          <p className="text-[11px] text-[var(--pt-text-tertiary)]">{[r.dosage_form, `sold per ${r.base_unit}`].filter(Boolean).join(" · ")}{!(sell && sell > 0) ? " · needs a price" : ""}</p>
                        </td>
                        <td className="px-2 py-1.5"><input className={cell} inputMode="numeric" aria-label={`Units per pack for ${r.name}`} value={e.units} onChange={(ev) => setEdit(r, { units: ev.target.value })} /></td>
                        {data?.can_edit_cost && <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" placeholder="0.00" aria-label={`Cost per pack for ${r.name}`} value={e.packCost} onChange={(ev) => setEdit(r, { packCost: ev.target.value })} /></td>}
                        <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" placeholder="0.00" aria-label={`Selling price per ${r.base_unit} for ${r.name}`} value={e.sell} onChange={(ev) => setEdit(r, { sell: ev.target.value })} /></td>
                        {data?.can_edit_cost && <td className={`px-4 py-1.5 text-right tabular-nums ${margin != null && margin < 0 ? "text-[var(--pt-red)]" : "text-[var(--pt-text-secondary)]"}`}>{margin != null ? `${margin}%` : "—"}</td>}
                      </tr>
                    )
                  })}
                  {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--pt-text-tertiary)]">No products to price.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--pt-border)] px-5 py-3">
              <p className="text-sm text-[var(--pt-text-secondary)]"><span className="font-semibold text-[var(--pt-text)]">{priced}</span> of {rows.length} priced</p>
              <Button variant="ghost" onClick={() => setDone({ priced, unpriced: rows.length - priced })} className="ml-auto">Price later</Button>
              <Button onClick={() => void save()} disabled={busy} className="bg-[var(--pt-green)] text-white hover:bg-[var(--pt-green-600)]">
                {busy && <Loader2 size={15} className="mr-1.5 animate-spin" />} Save prices
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
