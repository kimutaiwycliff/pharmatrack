"use client"

import { useState, useMemo, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Search, Rocket } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"

interface Row {
  product_id: string; name: string; brand_name: string | null; strength: string | null
  base_unit: string; pack_label: string | null; units_per_pack: number | null
  is_active: boolean; cost_price: number | null; selling_price: number | null; stock_on_hand: number
}
interface Edit { cost: string; sell: string; qty: string; active: boolean }

const n = (s: string) => { const v = Number(s); return Number.isFinite(v) ? v : 0 }
const margin = (cost: string, sell: string) => {
  const c = n(cost), s = n(sell)
  if (!s || !c) return null
  return Math.round(((s - c) / s) * 100)
}

export function CatalogReviewDialog({
  open, onClose, branchId,
}: { open: boolean; onClose: () => void; branchId: string | null }) {
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [busy, setBusy] = useState(false)

  const { data, isLoading } = useQuery<{ products: Row[] }>({
    queryKey: ["catalog-review", branchId],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/review?branch_id=${branchId}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: open && !!branchId,
  })

  // Seed local edit state from server rows whenever they (re)load.
  useEffect(() => {
    if (!data) return
    const init: Record<string, Edit> = {}
    for (const r of data.products) {
      init[r.product_id] = {
        cost: r.cost_price != null ? String(r.cost_price) : "",
        sell: r.selling_price != null ? String(r.selling_price) : "",
        qty: r.stock_on_hand ? String(r.stock_on_hand) : "",
        active: r.is_active,
      }
    }
    // Resetting the editable copy when the server rows change is the intended
    // behaviour here (not derivable during render — the user mutates `edits`).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdits(init)
  }, [data])

  const rows = data?.products ?? []
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) =>
      r.name.toLowerCase().includes(s) || (r.brand_name?.toLowerCase().includes(s) ?? false))
  }, [rows, q])

  function set(id: string, key: keyof Edit, value: string | boolean) {
    setEdits((p) => {
      const cur: Edit = p[id] ?? { cost: "", sell: "", qty: "", active: true }
      return { ...p, [id]: { ...cur, [key]: value } as Edit }
    })
  }

  // Only send rows whose values differ from the server snapshot.
  function dirtyItems() {
    const out: { id: string; cost_price: number | null; selling_price: number; is_active: boolean; opening_qty: number }[] = []
    for (const r of rows) {
      const e = edits[r.product_id]; if (!e) continue
      const cost = e.cost === "" ? null : n(e.cost)
      const sell = n(e.sell)
      const qty = e.qty === "" ? 0 : Math.max(0, Math.trunc(n(e.qty)))
      const changed =
        cost !== (r.cost_price ?? null) || sell !== (r.selling_price ?? 0) ||
        e.active !== r.is_active || qty !== (r.stock_on_hand ?? 0)
      if (changed) out.push({ id: r.product_id, cost_price: cost, selling_price: sell, is_active: e.active, opening_qty: qty })
    }
    return out
  }

  async function save() {
    const items = dirtyItems()
    if (items.length === 0) { toast.info("No changes to save"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/catalog/review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branch_id: branchId, items }),
      })
      const json = (await res.json()) as { priced?: number; stocked?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success(`Saved ${items.length} products — you're live`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalog-review", branchId] }),
        qc.invalidateQueries({ queryKey: ["inventory"] }),
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  const dirtyCount = dirtyItems().length

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Rocket size={18} className="text-[var(--pt-green-600)]" /> Price &amp; stock</DialogTitle>
          <DialogDescription>
            Set selling price (per {rows[0]?.base_unit ?? "unit"}), cost, and opening quantity. Reference
            prices are pre-filled — tune them, then save to go live.
          </DialogDescription>
        </DialogHeader>

        <div className="relative max-w-xs mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)] pointer-events-none" />
          <Input placeholder="Filter products…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>

        <div className="max-h-[52vh] overflow-y-auto border border-[var(--pt-border)] rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--pt-surface)] border-b border-[var(--pt-border)] z-10">
              <tr className="text-[11px] uppercase tracking-wide text-[var(--pt-text-secondary)]">
                <th className="text-left font-semibold px-3 py-2">Product</th>
                <th className="text-right font-semibold px-2 py-2 w-28">Cost</th>
                <th className="text-right font-semibold px-2 py-2 w-28">Sell</th>
                <th className="text-right font-semibold px-2 py-2 w-14">Margin</th>
                <th className="text-right font-semibold px-2 py-2 w-24">Opening qty</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="py-8 text-center text-[var(--pt-text-secondary)]"><Loader2 className="animate-spin inline" size={16} /> Loading…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-[var(--pt-text-secondary)]">No seeded products. Run Quick Start first.</td></tr>}
              {filtered.map((r) => {
                const e = edits[r.product_id]; if (!e) return null
                const m = margin(e.cost, e.sell)
                return (
                  <tr key={r.product_id} className="border-b border-[var(--pt-border)] last:border-0 hover:bg-[var(--pt-muted)]/40">
                    <td className="px-3 py-1.5">
                      <div className="font-medium leading-tight">{r.name}{r.strength ? ` ${r.strength}` : ""}</div>
                      <div className="text-[11px] text-[var(--pt-text-secondary)]">{r.brand_name ?? r.pack_label ?? r.base_unit}</div>
                    </td>
                    <td className="px-2 py-1.5"><input inputMode="decimal" value={e.cost} onChange={(ev) => set(r.product_id, "cost", ev.target.value)} className="w-full text-right h-8 px-2 rounded border border-[var(--pt-border)] bg-transparent tabular-nums" /></td>
                    <td className="px-2 py-1.5"><input inputMode="decimal" value={e.sell} onChange={(ev) => set(r.product_id, "sell", ev.target.value)} className="w-full text-right h-8 px-2 rounded border border-[var(--pt-border)] bg-transparent tabular-nums" /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-xs text-[var(--pt-text-secondary)]">{m == null ? "—" : `${m}%`}</td>
                    <td className="px-2 py-1.5"><input inputMode="numeric" value={e.qty} onChange={(ev) => set(r.product_id, "qty", ev.target.value)} placeholder="0" className="w-full text-right h-8 px-2 rounded border border-[var(--pt-border)] bg-transparent tabular-nums" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <Button onClick={save} disabled={busy || dirtyCount === 0}
            className="gap-1.5 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            {dirtyCount > 0 ? `Save ${dirtyCount} & go live` : "Saved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
