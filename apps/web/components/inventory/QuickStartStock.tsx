"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Search, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBranchScope } from "@/lib/hooks/useBranchScope"
import { useSessionStore } from "@/lib/store/sessionStore"

// Quick Start step 3 (ADR-019): count what's on the shelf for the products
// just priced — quantity in units and the expiry month — so the pharmacy
// leaves Quick Start with stock it can sell. Each row becomes a batch through
// the same API as Receive stock (/api/batches). Expiry is required; it's never
// guessed.

interface Row { product_id: string; name: string; strength: string | null; base_unit: string; is_active: boolean; selling_price: number | null }
interface Edit { qty: string; expiry: string; batch: string }

/** "2028-06" → "2028-06-30" (the batch expires at the end of that month). */
export function endOfMonth(ym: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return null
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
  return `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`
}
const thisMonth = () => new Date().toISOString().slice(0, 7)

export function QuickStartStock({ ids, onClose }: { ids?: string[]; onClose: () => void }) {
  const qc = useQueryClient()
  const scope = useBranchScope()
  const branches = useSessionStore((s) => s.branches)
  const [branchId, setBranchId] = useState<string>("")
  const key = ids?.length ? ids.join(",") : ""
  const { data, isLoading } = useQuery<{ products: Row[] }>({
    queryKey: ["quickstart-stock", key],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/review${key ? `?ids=${key}` : ""}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)

  const branch = scope.branchId ?? (branchId || branches[0]?.id || "")
  const rows = (data?.products ?? []).filter((r) => (r.selling_price ?? 0) > 0)
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : rows
  const edit = (id: string) => edits[id] ?? { qty: "", expiry: "", batch: "" }
  const set = (id: string, patch: Partial<Edit>) => setEdits((e) => ({ ...e, [id]: { ...edit(id), ...patch } }))

  const filled = rows.filter((r) => Number(edit(r.product_id).qty) > 0)
  const missingExpiry = filled.filter((r) => !endOfMonth(edit(r.product_id).expiry))
  const past = filled.filter((r) => { const e = edit(r.product_id).expiry; return !!e && e < thisMonth() })

  async function save() {
    if (!branch) { toast.error("Pick the branch this stock is in"); return }
    if (missingExpiry.length) { toast.error(`Add the expiry month for ${missingExpiry.length} product${missingExpiry.length === 1 ? "" : "s"}`); return }
    if (past.length) { toast.error(`${past.length} expiry date${past.length === 1 ? " is" : "s are"} in the past — expired stock can't be sold`); return }
    setBusy(true)
    let ok = 0
    const failed: string[] = []
    for (const r of filled) {
      const e = edit(r.product_id)
      const res = await fetch("/api/batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: r.product_id, branch_id: branch, batch_number: e.batch.trim() || "OPENING",
          expiry_date: endOfMonth(e.expiry), quantity_received: Math.round(Number(e.qty)), notes: "Quick Start stock take",
        }),
      }).catch(() => null)
      if (res?.ok) ok++
      else failed.push(r.name)
    }
    setBusy(false)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["inventory"] }), qc.invalidateQueries({ queryKey: ["products"] }),
      qc.invalidateQueries({ queryKey: ["setup-progress"] }),
    ])
    if (failed.length) toast.error(`Couldn't save stock for ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`)
    if (ok > 0) setSaved(ok)
  }

  if (saved !== null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 size={44} className="text-[var(--pt-green-600)]" />
        <div>
          <p className="text-lg font-semibold">{saved} product{saved === 1 ? "" : "s"} in stock — you&apos;re ready to sell</p>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Add the rest any time from Stock Receive.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/pos?coach=1" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--pt-green)] px-4 text-sm font-semibold text-white hover:bg-[var(--pt-green-600)]">
            <ShoppingCart size={16} /> Make your first sale
          </Link>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--pt-border)] px-5 py-2.5">
        <div className="relative mr-auto w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" aria-label="Find a product"
            className="h-9 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]" />
        </div>
        {!scope.branchId && branches.length > 1 && (
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-[var(--pt-text-secondary)]">Branch</span>
            <select value={branch} onChange={(e) => setBranchId(e.target.value)} className="h-9 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 text-sm">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-[var(--pt-text-secondary)]"><Loader2 size={18} className="mr-2 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--pt-text-secondary)]">Set a selling price first — only priced products can be stocked here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--pt-muted)]">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[var(--pt-text-secondary)]">
                <th className="px-5 py-2">Product</th>
                <th className="px-2 py-2 w-28">On the shelf</th>
                <th className="px-2 py-2 w-40">Expiry month</th>
                <th className="px-2 py-2 w-32 hidden sm:table-cell">Batch (optional)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--pt-border)]">
              {shown.map((r) => {
                const e = edit(r.product_id)
                const needsExpiry = Number(e.qty) > 0 && !endOfMonth(e.expiry)
                return (
                  <tr key={r.product_id}>
                    <td className="px-5 py-2">
                      <p className="font-medium">{r.name}</p>
                      {r.strength && <p className="text-xs text-[var(--pt-text-tertiary)]">{r.strength}</p>}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} inputMode="numeric" value={e.qty} onChange={(ev) => set(r.product_id, { qty: ev.target.value })}
                          aria-label={`Quantity of ${r.name}`} placeholder="0"
                          className="h-9 w-16 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 text-right text-sm tabular-nums" />
                        <span className="text-xs text-[var(--pt-text-tertiary)]">{r.base_unit}s</span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input type="month" min={thisMonth()} value={e.expiry} onChange={(ev) => set(r.product_id, { expiry: ev.target.value })}
                        aria-label={`Expiry month of ${r.name}`}
                        className={`h-9 w-36 rounded-lg border bg-[var(--pt-surface)] px-2 text-sm ${needsExpiry ? "border-amber-500" : "border-[var(--pt-border)]"}`} />
                    </td>
                    <td className="px-2 py-2 hidden sm:table-cell">
                      <input value={e.batch} onChange={(ev) => set(r.product_id, { batch: ev.target.value })} placeholder="OPENING" aria-label={`Batch number of ${r.name}`}
                        className="h-9 w-28 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 text-sm" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--pt-border)] px-5 py-3">
        <p className="mr-auto text-xs text-[var(--pt-text-secondary)]">
          {filled.length ? `${filled.length} product${filled.length === 1 ? "" : "s"} to stock` : "Type how many you have of each — leave the rest for later."}
        </p>
        <Button variant="ghost" onClick={onClose}>Later</Button>
        <Button onClick={() => void save()} disabled={busy || filled.length === 0} className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
          {busy ? <Loader2 size={15} className="animate-spin" /> : `Save stock`}
        </Button>
      </div>
    </>
  )
}
