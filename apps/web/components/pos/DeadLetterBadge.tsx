"use client"

import { useEffect, useState } from "react"
import { liveQuery } from "dexie"
import { AlertOctagon } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { posDB, dismissDeadLetter, type DeadLetterSale } from "@/lib/offline/db"
import { useConfirm } from "@/components/ui/confirm-dialog"

const fmtKES = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Offline sales the server permanently rejected (usually insufficient stock by
 * the time they synced). The customer already paid, so these must not vanish:
 * the cashier/manager reviews each one, fixes stock or records it by hand, then
 * dismisses it.
 */
export function DeadLetterBadge() {
  const [items, setItems] = useState<DeadLetterSale[]>([])
  const [open, setOpen] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    const sub = liveQuery(() => posDB.deadLetters.orderBy("failedAt").reverse().toArray())
      .subscribe({ next: setItems, error: () => {} })
    return () => sub.unsubscribe()
  }, [])

  if (items.length === 0) return null

  async function dismiss(d: DeadLetterSale) {
    const ok = await confirm("Only dismiss once the cash and stock for this sale have been reconciled by hand.", {
      title: "Dismiss this sale?", confirmLabel: "Dismiss",
    })
    if (ok && d.id != null) await dismissDeadLetter(d.id)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/25 transition-colors"
      >
        <AlertOctagon size={13} /> {items.length} need review
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-6">
          <h2 className="text-lg font-bold">Offline sales that couldn&apos;t sync</h2>
          <p className="text-sm text-[var(--pt-text-secondary)] mb-4">
            These were sold while offline but the server refused them when the connection came back. Money was taken,
            so check stock and record them by hand before dismissing.
          </p>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {items.map((d) => {
              const total = d.sale.items.reduce((s, i) => s + i.line_total, 0) - (d.sale.discount ?? 0)
              return (
                <div key={d.id} className="rounded-xl border border-[var(--pt-border)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{fmtKES(total)} · {d.sale.paymentMethod.toUpperCase()}</p>
                      <p className="text-xs text-[var(--pt-text-tertiary)]">
                        Sold {new Date(d.sale.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => dismiss(d)}>Dismiss</Button>
                  </div>
                  <ul className="mt-2 text-xs text-[var(--pt-text-secondary)] space-y-0.5">
                    {d.sale.items.map((i, idx) => (
                      <li key={idx}>{i.quantity} × {i.product_name}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-red-700 dark:text-red-300">{d.error}</p>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
