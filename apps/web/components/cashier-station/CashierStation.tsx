"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Banknote, CreditCard, Loader2, ScanLine, Smartphone, SplitSquareHorizontal, Trash2, X } from "lucide-react"
import type { Sale, SaleItem } from "@pharmatrack/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { CashModal } from "@/components/pos/CashModal"
import { MpesaModal } from "@/components/pos/MpesaModal"
import { SplitModal } from "@/components/pos/SplitModal"
import { ReceiptModal } from "@/components/pos/ReceiptModal"
import { postJson } from "@/lib/api/fetcher"
import { formatKES } from "@/lib/store/cartStore"
import { useOnline } from "@/lib/offline/useOnline"
import type { StationOrder } from "@/lib/cashier-station/client"
import { CardModal } from "./CardModal"

// The cashier station (ADR-021): open orders for the branch, oldest first.
// Scan the slip (or type its number), check the lines, take payment — paying
// is the release: hand the goods over and give the receipt.

type Pay = "cash" | "mpesa" | "card" | "split" | null

interface Branch { id: string; name: string; address?: string | null; phone?: string | null }

export function CashierStation({ branch, shiftId, cashierName }: { branch: Branch; shiftId: string; cashierName: string }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const online = useOnline()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pay, setPay] = useState<Pay>(null)
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState("")
  const [receipt, setReceipt] = useState<React.ComponentProps<typeof ReceiptModal>["data"]>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  // Minutes left on each order: a clock that ticks, not Date.now() in render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  const { data: mpesaAvail } = useQuery<{ available: boolean }>({
    queryKey: ["mpesaAvailable"],
    queryFn: async () => {
      const r = await fetch("/api/mpesa/available")
      return r.ok ? (r.json() as Promise<{ available: boolean }>) : { available: false }
    },
    staleTime: 5 * 60_000,
  })

  const queueKey = ["stationQueue", branch.id]
  const { data: queue, isLoading } = useQuery<{ orders: StationOrder[] }>({
    queryKey: queueKey,
    queryFn: async () => {
      const r = await fetch(`/api/orders?branch_id=${branch.id}&view=queue`)
      if (!r.ok) throw new Error("Couldn't load the queue")
      return r.json() as Promise<{ orders: StationOrder[] }>
    },
    enabled: online,
    refetchInterval: 4000,
  })
  const orders = queue?.orders ?? []

  const { data: detail, refetch: refetchDetail } = useQuery<{ order: StationOrder } | null>({
    queryKey: ["stationOrder", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const r = await fetch(`/api/orders/${selectedId}`)
      if (!r.ok) return null
      return r.json() as Promise<{ order: StationOrder }>
    },
  })
  const order = detail?.order ?? null

  // The scanner types the slip's number + Enter into this box; keep it ready.
  const idle = !pay && !receipt
  useEffect(() => { if (idle) scanRef.current?.focus() }, [idle, selectedId])

  async function lookup(text: string) {
    const q = text.trim()
    if (!q) return
    const inQueue = orders.find((o) => o.label.toLowerCase() === q.toLowerCase().replace(/^([a-z])-?/i, "$1-"))
    if (inQueue) { setSelectedId(inQueue.id); setScan(""); return }
    const r = await fetch(`/api/orders?branch_id=${branch.id}&number=${encodeURIComponent(q)}`)
    const json = (await r.json().catch(() => ({}))) as { order?: StationOrder; error?: string }
    if (!r.ok || !json.order) { toast.error(json.error ?? `No order ${q} today`); return }
    if (json.order.status !== "awaiting_payment") toast.info(`${json.order.label} is ${json.order.status === "paid" ? "already paid" : json.order.status}`)
    setSelectedId(json.order.id)
    setScan("")
  }

  function refresh() {
    void qc.invalidateQueries({ queryKey: queueKey })
    void refetchDetail()
  }

  async function removeLine(lineId: string, name: string) {
    if (!order || !(await confirm(`Take ${name} off ${order.label}? Its stock goes back on the shelf.`, { title: "Remove line", confirmLabel: "Remove" }))) return
    try {
      await postJson(`/api/orders/${order.id}/remove-line`, { line_id: lineId })
      refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove it") }
  }

  async function cancelOrder() {
    if (!order || !(await confirm(`Cancel ${order.label}? The customer will need a new order.`, { title: "Cancel order", confirmLabel: "Cancel order" }))) return
    try {
      await postJson(`/api/orders/${order.id}/cancel`, {})
      toast.success(`${order.label} cancelled`)
      setSelectedId(null)
      refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't cancel it") }
  }

  const inFlight = useRef(false)
  async function collect(payment: Record<string, unknown>) {
    if (!order || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const out = await postJson<{ sale: Sale; items: SaleItem[]; paperWidth?: "58mm" | "80mm" }>(`/api/orders/${order.id}/collect`, { shift_id: shiftId, ...payment })
      setPay(null)
      setReceipt({
        sale: out.sale, items: out.items, branchName: branch.name, branchAddress: branch.address ?? null,
        branchPhone: branch.phone ?? null, cashierName, orgName: out.sale.org_name ?? "PharmaTrack", paperWidth: out.paperWidth ?? "80mm",
      })
      toast.success(`${order.label} paid — hand over the items`, { duration: 6000 })
      setSelectedId(null)
      void qc.invalidateQueries({ queryKey: queueKey })
      void qc.invalidateQueries({ queryKey: ["productSearch"] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment wasn't recorded")
      refresh()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const open = order?.status === "awaiting_payment" && new Date(order.expires_at).getTime() > now
  const total = order?.total_amount ?? 0
  const minutesLeft = (o: StationOrder) => Math.max(0, Math.round((new Date(o.expires_at).getTime() - now) / 60000))

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-[var(--pt-bg)]">
      {/* Queue */}
      <div className="md:w-[40%] flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-[var(--pt-border)]">
        <form className="p-3 border-b border-[var(--pt-border)] flex gap-2" onSubmit={(e) => { e.preventDefault(); void lookup(scan) }}>
          <div className="relative flex-1">
            <ScanLine size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
            <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan the slip or type A-047" className="pl-8" disabled={!online} />
          </div>
          <Button type="submit" variant="outline" disabled={!online || !scan.trim()}>Find</Button>
        </form>
        <div className="flex-1 overflow-y-auto">
          {!online && <p className="p-4 text-sm text-[var(--pt-text-secondary)]">No connection — the queue comes back when you&apos;re online.</p>}
          {online && isLoading && <div className="p-6 flex justify-center"><Loader2 size={18} className="animate-spin" /></div>}
          {online && !isLoading && orders.length === 0 && (
            <p className="p-6 text-sm text-center text-[var(--pt-text-secondary)]">No orders waiting. They appear here as the order desks send them.</p>
          )}
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--pt-border)] flex items-center gap-3 hover:bg-[var(--pt-muted)] ${selectedId === o.id ? "bg-[var(--pt-green-50)]" : ""}`}
            >
              <span className="text-lg font-black tabular-nums w-16">{o.label}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold tabular-nums">{formatKES(o.total_amount)}</span>
                <span className="block text-xs text-[var(--pt-text-secondary)] truncate">
                  {o.line_count} item{o.line_count === 1 ? "" : "s"} · {o.sent_by_name ?? "Order desk"}
                </span>
              </span>
              <span className={`text-xs tabular-nums ${minutesLeft(o) <= 5 ? "text-amber-700 font-semibold" : "text-[var(--pt-text-tertiary)]"}`}>{minutesLeft(o)} min</span>
            </button>
          ))}
        </div>
      </div>

      {/* Order */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!order ? (
          <div className="flex-1 flex items-center justify-center p-6 text-sm text-[var(--pt-text-secondary)]">Pick an order from the queue, or scan its slip.</div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--pt-border)]">
              <div className="text-3xl font-black tabular-nums">{order.label}</div>
              <div className="text-sm text-[var(--pt-text-secondary)]">from {order.sent_by_name ?? "order desk"}</div>
              <button onClick={() => setSelectedId(null)} className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted)]" aria-label="Close order"><X size={16} /></button>
            </div>
            {!open && (
              <div className="mx-5 mt-4 rounded-lg bg-[var(--pt-muted)] px-3 py-2 text-sm">
                {order.status === "paid" ? "Already paid." : order.status === "cancelled" ? "This order was cancelled." : "This order has expired — the order desk can send it again."}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {(order.lines ?? []).map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-2 border-b border-[var(--pt-border)]">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{l.product_name}{l.product_strength ? ` ${l.product_strength}` : ""}</div>
                    <div className="text-xs text-[var(--pt-text-secondary)] tabular-nums">
                      {l.unit_count ? `${l.quantity / l.unit_count} × pack of ${l.unit_count}` : `${l.quantity} ${l.base_unit}`}
                      {l.discount_percent > 0 ? ` · ${l.discount_percent}% off` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{formatKES(l.line_total)}</div>
                  {open && (order.lines?.length ?? 0) > 1 && (
                    <button onClick={() => void removeLine(l.id, l.product_name)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--pt-text-tertiary)] hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${l.product_name}`}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--pt-border)] p-4 space-y-3 bg-[var(--pt-surface)]">
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-[var(--pt-text-secondary)]"><span>Discount</span><span className="tabular-nums">−{formatKES(order.discount_amount)}</span></div>
              )}
              <div className="flex justify-between items-baseline"><span className="font-semibold">To pay</span><span className="text-2xl font-bold tabular-nums">{formatKES(total)}</span></div>
              {open && (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <Button onClick={() => setPay("cash")} disabled={busy || !online}><Banknote size={16} className="mr-1" />Cash</Button>
                    <Button onClick={() => setPay("mpesa")} disabled={busy || !online}><Smartphone size={16} className="mr-1" />M-Pesa</Button>
                    <Button onClick={() => setPay("card")} disabled={busy || !online}><CreditCard size={16} className="mr-1" />Card</Button>
                    <Button onClick={() => setPay("split")} disabled={busy || !online} variant="outline"><SplitSquareHorizontal size={16} className="mr-1" />Split</Button>
                  </div>
                  <button onClick={() => void cancelOrder()} className="text-xs text-[var(--pt-text-secondary)] underline">Cancel this order</button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <CashModal key={pay === "cash" ? "c1" : "c0"} open={pay === "cash"} total={total} submitting={busy} onClose={() => setPay(null)}
        onConfirm={(tendered, change) => void collect({ payment_method: "cash", amount_tendered: tendered, change_given: change })} />
      <MpesaModal key={pay === "mpesa" ? "m1" : "m0"} open={pay === "mpesa"} total={total} submitting={busy} online={online}
        stkAvailable={mpesaAvail?.available ?? false} onClose={() => setPay(null)}
        onConfirm={(ref, how) => void collect({
          payment_method: "mpesa", amount_tendered: total, change_given: 0,
          mpesa_reference: ref, mpesa_checkout_request_id: how.checkoutRequestId ?? null,
        })} />
      <CardModal key={pay === "card" ? "k1" : "k0"} open={pay === "card"} total={total} submitting={busy} onClose={() => setPay(null)}
        onConfirm={(code) => void collect({ payment_method: "card", card_reference: code })} />
      <SplitModal key={pay === "split" ? "s1" : "s0"} open={pay === "split"} total={total} submitting={busy} online={online}
        stkAvailable={mpesaAvail?.available ?? false} onClose={() => setPay(null)}
        onConfirm={(cashAmt, mpesaAmt, ref, how) => void collect({
          payment_method: "split", amount_tendered: cashAmt, change_given: 0, cash_amount: cashAmt, mpesa_amount: mpesaAmt,
          mpesa_reference: ref, mpesa_checkout_request_id: how.checkoutRequestId ?? null,
        })} />
      <ReceiptModal open={receipt !== null} data={receipt} onNewSale={() => setReceipt(null)} closeLabel="Next order" autoPrint />
    </div>
  )
}
