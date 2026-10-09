"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2, Plus, ScanBarcode, Trash2, PackageCheck, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useBarcodeScanner } from "@/lib/barcode/useBarcodeScanner"
import { formatKES } from "@/lib/store/cartStore"
import { useCan } from "@/lib/store/sessionStore"
import type { PurchaseOrderDetail } from "@/lib/purchasing/load"

interface BatchDraft {
  batch_number: string
  expiry_date: string
  quantity: string
  unit_cost: string
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date())
const toISODate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(d)

/**
 * Check a delivery in against its purchase order. Every line starts with the
 * outstanding quantity and the PO cost; staff fill in batch number + expiry
 * (or scan the GS1 DataMatrix to fill them), split a line into several
 * batches when the supplier mixes lots, and untick anything that didn't come.
 */
export function ReceiveDeliveryPanel({ order, onDone, onCancel }: {
  order: PurchaseOrderDetail
  onDone: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const canSeeCost = useCan("cost.view")
  const open = order.items.filter((i) => i.product_id)
  const [included, setIncluded] = useState<Record<string, boolean>>(
    () => Object.fromEntries(open.map((i) => [i.id, i.quantity_received < i.quantity_ordered])),
  )
  const [batches, setBatches] = useState<Record<string, BatchDraft[]>>(() => Object.fromEntries(open.map((i) => [i.id, [{
    batch_number: "", expiry_date: "",
    quantity: String(Math.max(1, i.quantity_ordered - i.quantity_received)),
    unit_cost: i.unit_cost == null ? "" : String(i.unit_cost),
  }]])))
  const [closeOrder, setCloseOrder] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastScanned, setLastScanned] = useState<string | null>(null)

  const setBatch = (itemId: string, idx: number, patch: Partial<BatchDraft>) =>
    setBatches((b) => ({ ...b, [itemId]: b[itemId]!.map((x, i) => (i === idx ? { ...x, ...patch } : x)) }))

  useBarcodeScanner({
    enabled: !saving,
    onScan: (e) => {
      if (!e.gtin) return
      const line = open.find((i) => i.gtin === e.gtin || i.barcode_raw === e.gtin || i.gtin === e.raw || i.barcode_raw === e.raw)
      if (!line) {
        toast.error("That barcode isn't on this order")
        return
      }
      setIncluded((s) => ({ ...s, [line.id]: true }))
      const rows = batches[line.id]!
      // Fill the first row still missing batch/expiry; if all are filled and
      // this is a different lot, start a new batch row.
      let idx = rows.findIndex((r) => !r.batch_number || !r.expiry_date)
      if (idx === -1 && e.batchNumber && !rows.some((r) => r.batch_number === e.batchNumber)) {
        setBatches((b) => ({ ...b, [line.id]: [...b[line.id]!, { batch_number: "", expiry_date: "", quantity: "1", unit_cost: rows[0]!.unit_cost }] }))
        idx = rows.length
      }
      if (idx !== -1) {
        setTimeout(() => setBatch(line.id, idx, {
          ...(e.batchNumber ? { batch_number: e.batchNumber } : {}),
          ...(e.expiryDate ? { expiry_date: toISODate(e.expiryDate) } : {}),
        }), 0)
      }
      setLastScanned(line.id)
      toast.success(`Matched ${line.product_name}${e.batchNumber ? ` · batch ${e.batchNumber}` : ""}`)
    },
  })

  const t = today()
  const problems: string[] = []
  const payload = open.filter((i) => included[i.id]).map((i) => {
    const rows = batches[i.id]!
    rows.forEach((r, n) => {
      const where = `${i.product_name}${rows.length > 1 ? ` (batch ${n + 1})` : ""}`
      if (!r.batch_number.trim()) problems.push(`${where}: batch number missing`)
      if (!r.expiry_date) problems.push(`${where}: expiry date missing`)
      else if (r.expiry_date <= t) problems.push(`${where}: already expired`)
      if (!(parseInt(r.quantity, 10) > 0)) problems.push(`${where}: quantity missing`)
    })
    return {
      item_id: i.id,
      batches: rows.map((r) => ({
        batch_number: r.batch_number.trim(),
        expiry_date: r.expiry_date,
        quantity: parseInt(r.quantity, 10) || 0,
        ...(canSeeCost && r.unit_cost !== "" ? { unit_cost: Number(r.unit_cost) } : {}),
      })),
    }
  })
  const receivingCount = payload.length
  const invoiceTotal = canSeeCost
    ? payload.reduce((s, l) => s + l.batches.reduce((x, b) => x + (b.unit_cost ?? 0) * b.quantity, 0), 0)
    : null
  const anyShort = open.some((i) => {
    if (!included[i.id]) return i.quantity_received < i.quantity_ordered
    const qty = (batches[i.id] ?? []).reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0)
    return i.quantity_received + qty < i.quantity_ordered
  })

  async function submit() {
    if (receivingCount === 0) { toast.error("Tick at least one item that arrived"); return }
    if (problems.length > 0) { toast.error(problems[0]!); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: payload, close: closeOrder }),
      })
      const json = (await res.json()) as { error?: string; batches?: number; complete?: boolean }
      if (!res.ok) throw new Error(json.error ?? "Failed to receive delivery")
      toast.success(`${json.batches} batch${json.batches === 1 ? "" : "es"} added to stock${json.complete ? " — order complete" : " — order still has items outstanding"}`)
      void qc.invalidateQueries({ queryKey: ["purchase-order", order.id] })
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] })
      void qc.invalidateQueries({ queryKey: ["inventory"] })
      void qc.invalidateQueries({ queryKey: ["products"] })
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to receive delivery")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-green-50)] px-4 py-3">
        <ScanBarcode size={18} className="text-[var(--pt-green-600)] shrink-0 mt-0.5" />
        <p className="text-sm text-[var(--pt-text)]">
          <span className="font-semibold">Scan each pack&apos;s barcode</span> to fill in its batch number and expiry automatically,
          or type them. Untick anything that didn&apos;t arrive.
        </p>
      </div>

      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] divide-y divide-[var(--pt-border)]">
        {open.map((i) => {
          const outstanding = Math.max(0, i.quantity_ordered - i.quantity_received)
          const rows = batches[i.id]!
          const on = !!included[i.id]
          return (
            <div key={i.id} className={`px-4 sm:px-5 py-4 transition-colors ${lastScanned === i.id ? "bg-[var(--pt-green-50)]/60" : ""} ${on ? "" : "opacity-55"}`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={on} onChange={(e) => setIncluded((s) => ({ ...s, [i.id]: e.target.checked }))} className="mt-1 accent-[var(--pt-green)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{i.product_name}{i.product_strength ? ` ${i.product_strength}` : ""}</p>
                  <p className="text-xs text-[var(--pt-text-secondary)]">
                    Ordered {i.quantity_ordered} × {i.pack_label ?? (i.units_per_pack > 1 ? `pack of ${i.units_per_pack}` : i.base_unit ?? "unit")}
                    {i.quantity_received > 0 ? ` · ${i.quantity_received} already received` : ""}
                    {outstanding === 0 ? " · complete" : ` · ${outstanding} outstanding`}
                  </p>
                </div>
              </label>
              {on && (
                <div className="mt-3 ml-7 space-y-2">
                  {rows.map((r, idx) => {
                    const expired = !!r.expiry_date && r.expiry_date <= t
                    return (
                      <div key={idx} className="grid grid-cols-2 sm:grid-cols-[1.3fr_1fr_0.6fr_0.9fr_auto] gap-2 items-end">
                        <label className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                          Batch no.
                          <Input value={r.batch_number} onChange={(e) => setBatch(i.id, idx, { batch_number: e.target.value })} className="h-9 mt-1 normal-case font-mono tracking-normal" placeholder="e.g. AMX2310" />
                        </label>
                        <label className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                          Expiry
                          <Input type="date" value={r.expiry_date} onChange={(e) => setBatch(i.id, idx, { expiry_date: e.target.value })}
                            className={`h-9 mt-1 normal-case tracking-normal ${expired ? "border-[var(--pt-red)]" : ""}`} />
                        </label>
                        <label className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                          Packs
                          <Input inputMode="numeric" value={r.quantity} onChange={(e) => setBatch(i.id, idx, { quantity: e.target.value.replace(/\D/g, "") })} className="h-9 mt-1 tabular-nums" />
                        </label>
                        {canSeeCost ? (
                          <label className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                            Cost / pack
                            <Input type="number" min={0} step="0.01" value={r.unit_cost} onChange={(e) => setBatch(i.id, idx, { unit_cost: e.target.value })}
                              className={`h-9 mt-1 tabular-nums ${i.unit_cost != null && r.unit_cost !== "" && Number(r.unit_cost) !== i.unit_cost ? "border-amber-400" : ""}`} />
                          </label>
                        ) : <span />}
                        <div className="flex items-center gap-1 pb-0.5">
                          {rows.length > 1 && (
                            <button onClick={() => setBatches((b) => ({ ...b, [i.id]: b[i.id]!.filter((_, n) => n !== idx) }))} aria-label="Remove batch"
                              className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-[var(--pt-red)]">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        {canSeeCost && i.unit_cost != null && r.unit_cost !== "" && Number(r.unit_cost) !== i.unit_cost && (
                          <p className="col-span-full text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <AlertTriangle size={11} /> Ordered at {formatKES(i.unit_cost)}/pack — invoice is {Number(r.unit_cost) > i.unit_cost ? "higher" : "lower"} by {formatKES(Math.abs(Number(r.unit_cost) - i.unit_cost))}
                          </p>
                        )}
                      </div>
                    )
                  })}
                  <button
                    onClick={() => setBatches((b) => ({ ...b, [i.id]: [...b[i.id]!, { batch_number: "", expiry_date: "", quantity: "1", unit_cost: rows[0]!.unit_cost }] }))}
                    className="text-xs font-semibold text-[var(--pt-green-600)] flex items-center gap-1 hover:underline"
                  >
                    <Plus size={12} /> Another batch of this item
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-sm">
            Receiving <span className="font-semibold">{receivingCount}</span> of {open.length} items
            {invoiceTotal != null && <> · invoice value <span className="font-semibold tabular-nums">{formatKES(invoiceTotal)}</span></>}
          </p>
          {anyShort && (
            <label className="flex items-center gap-2 text-sm text-[var(--pt-text-secondary)] cursor-pointer">
              <input type="checkbox" checked={closeOrder} onChange={(e) => setCloseOrder(e.target.checked)} className="accent-[var(--pt-green)]" />
              Some items are short — close the order anyway (no more deliveries expected)
            </label>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />} Confirm receipt
          </Button>
        </div>
      </div>
    </div>
  )
}
