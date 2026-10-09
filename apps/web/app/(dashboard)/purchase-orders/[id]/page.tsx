"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowLeft, Download, Mail, MessageCircle, Send, PackageCheck, Ban, Trash2, Loader2, Minus, Plus, Save,
} from "lucide-react"
import { normalizeKePhone } from "@pharmatrack/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { PoStatusBadge } from "@/components/purchasing/PoStatusBadge"
import { ReceiveDeliveryPanel } from "@/components/purchasing/ReceiveDeliveryPanel"
import { useCan } from "@/lib/store/sessionStore"
import { formatKES } from "@/lib/store/cartStore"
import type { PurchaseOrderDetail } from "@/lib/purchasing/load"
import type { PoPdfOrg } from "@/components/purchasing/PurchaseOrderPDF"

type Detail = { order: PurchaseOrderDetail; org: PoPdfOrg }

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }) : "—"

async function downloadPdf(order: PurchaseOrderDetail, org: PoPdfOrg, showPrices: boolean) {
  const [{ pdf }, { PurchaseOrderPDFDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/purchasing/PurchaseOrderPDF"),
  ])
  const blob = await pdf(<PurchaseOrderPDFDocument order={order} org={org} showPrices={showPrices} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${order.po_number}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

function whatsappText(order: PurchaseOrderDetail, org: PoPdfOrg, showPrices: boolean) {
  const lines = order.items.map((i, n) =>
    `${n + 1}. ${i.product_name}${i.product_strength ? ` ${i.product_strength}` : ""} — ${i.quantity_ordered} × ${i.pack_label ?? (i.units_per_pack > 1 ? `pack of ${i.units_per_pack}` : i.base_unit ?? "unit")}` +
    (showPrices && i.unit_cost != null ? ` @ ${formatKES(i.unit_cost)}` : ""))
  return [
    `Hello${order.supplier_name ? ` ${order.supplier_name}` : ""}, please supply the following for ${org.name}${order.branch_name ? ` (${order.branch_name})` : ""}:`,
    "",
    `*Purchase order ${order.po_number}*`,
    ...lines,
    ...(showPrices && order.total != null ? ["", `Estimated total: ${formatKES(order.total)}`] : []),
    ...(order.expected_date ? [`Needed by: ${day(order.expected_date)}`] : []),
    "",
    "Kindly confirm availability and quote the PO number on your invoice. Thank you.",
  ].join("\n")
}

export default function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const canManage = useCan("purchasing.manage")
  const canReceive = useCan("purchasing.receive")
  const canSeeCost = useCan("cost.view")
  const [mode, setMode] = useState<"view" | "receive">("view")
  const [showPrices, setShowPrices] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  // Draft line edits (packs / cost per pack), keyed by PO item id.
  const [draft, setDraft] = useState<Record<string, { packs: number; cost: number | null; removed?: boolean }>>({})

  const { data, isLoading, refetch } = useQuery<Detail>({
    queryKey: ["purchase-order", id],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-orders/${id}`)
      if (!res.ok) throw new Error("Failed to load purchase order")
      return res.json() as Promise<Detail>
    },
  })

  if (isLoading || !data) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />)}</div>
  }
  const { order, org } = data
  const editable = canManage && order.status === "draft"
  const receivable = canReceive && ["draft", "sent", "partially_received"].includes(order.status)
  const dirty = Object.keys(draft).length > 0
  const pricesVisible = canSeeCost && showPrices

  async function patch(body: Record<string, unknown>, label: string, success: string) {
    setBusy(label)
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to update order")
      toast.success(success)
      setDraft({})
      await refetch()
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order")
    } finally {
      setBusy(null)
    }
  }

  function saveLines() {
    const items = order.items
      .filter((i) => i.product_id && !draft[i.id]?.removed)
      .map((i) => ({
        product_id: i.product_id!, quantity_ordered: draft[i.id]?.packs ?? i.quantity_ordered,
        units_per_pack: i.units_per_pack, pack_label: i.pack_label,
        ...(canSeeCost ? { unit_cost: draft[i.id] ? draft[i.id]!.cost : i.unit_cost } : {}),
      }))
    if (items.length === 0) { toast.error("An order needs at least one item — delete the draft instead"); return }
    void patch({ items }, "save", "Order updated")
  }

  async function remove() {
    const ok = await confirm(`Delete draft ${order.po_number}?`, { title: "Delete draft?", confirmLabel: "Delete" })
    if (!ok) return
    setBusy("delete")
    const res = await fetch(`/api/purchase-orders/${id}`, { method: "DELETE" })
    setBusy(null)
    if (!res.ok) { toast.error("Failed to delete draft"); return }
    void qc.invalidateQueries({ queryKey: ["purchase-orders"] })
    toast.success("Draft deleted")
    router.push("/purchase-orders")
  }

  async function cancelOrder() {
    const ok = await confirm(
      order.status === "partially_received"
        ? "Stock already received stays in inventory; nothing more will be expected."
        : "The supplier won't be notified automatically — let them know too.",
      { title: `Cancel ${order.po_number}?`, confirmLabel: "Cancel order" },
    )
    if (ok) void patch({ action: "cancel" }, "cancel", "Order cancelled")
  }

  function openWhatsApp() {
    const text = encodeURIComponent(whatsappText(order, org, pricesVisible))
    const phone = order.supplier_phone ? normalizeKePhone(order.supplier_phone).replace(/^\+/, "") : ""
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener")
    if (order.status === "draft" && canManage) {
      toast("Sent it on WhatsApp?", { action: { label: "Mark as sent", onClick: () => void patch({ action: "send" }, "send", "Marked as sent") } })
    }
  }

  const lineQty = (i: PurchaseOrderDetail["items"][number]) => draft[i.id]?.packs ?? i.quantity_ordered
  const lineCost = (i: PurchaseOrderDetail["items"][number]) => (draft[i.id] ? draft[i.id]!.cost : i.unit_cost)
  const visibleItems = order.items.filter((i) => !draft[i.id]?.removed)
  const total = visibleItems.reduce((s, i) => s + (lineCost(i) ?? 0) * lineQty(i), 0)
  const setLine = (i: PurchaseOrderDetail["items"][number], patchLine: Partial<{ packs: number; cost: number | null; removed: boolean }>) =>
    setDraft((d) => ({ ...d, [i.id]: { packs: lineQty(i), cost: lineCost(i), ...d[i.id], ...patchLine } }))

  return (
    <div>
      <div className="flex items-start gap-3 mb-5">
        <button onClick={() => (mode === "receive" ? setMode("view") : router.push("/purchase-orders"))} aria-label="Back"
          className="w-8 h-8 mt-0.5 rounded-md flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{mode === "receive" ? "Receive delivery" : order.supplier_name ?? "Purchase order"}</h1>
            <PoStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            <span className="font-mono">{order.po_number}</span>
            {order.branch_name ? ` · ${order.branch_name}` : ""} · created {day(order.created_at)}
            {order.created_by_name ? ` by ${order.created_by_name}` : ""}
            {order.expected_date ? ` · needed by ${day(order.expected_date)}` : ""}
          </p>
        </div>
      </div>

      {mode === "receive" ? (
        <ReceiveDeliveryPanel order={order} onCancel={() => setMode("view")} onDone={() => { setMode("view"); void refetch() }} />
      ) : (
        <>
          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {receivable && (
              <Button onClick={() => setMode("receive")} className="gap-2"><PackageCheck size={15} /> Receive delivery</Button>
            )}
            {canManage && order.status !== "cancelled" && (
              <>
                <Button variant="outline" className="gap-2" disabled={!!busy}
                  onClick={async () => { setBusy("pdf"); try { await downloadPdf(order, org, pricesVisible) } finally { setBusy(null) } }}>
                  {busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} PDF
                </Button>
                <Button variant="outline" className="gap-2" onClick={openWhatsApp}><MessageCircle size={15} /> WhatsApp</Button>
                <Button variant="outline" className="gap-2" onClick={() => setEmailOpen(true)}><Mail size={15} /> Email</Button>
              </>
            )}
            {canManage && order.status === "draft" && (
              <Button variant="outline" className="gap-2" disabled={!!busy} onClick={() => void patch({ action: "send" }, "send", "Marked as sent")}>
                <Send size={15} /> Mark as sent
              </Button>
            )}
            <div className="flex-1" />
            {canSeeCost && (
              <label className="flex items-center gap-2 text-xs text-[var(--pt-text-secondary)] cursor-pointer">
                <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} className="accent-[var(--pt-green)]" />
                Prices on PDF / WhatsApp
              </label>
            )}
            {canManage && order.status === "draft" && (
              <Button variant="ghost" className="gap-1.5 text-[var(--pt-red)]" onClick={remove} disabled={!!busy}><Trash2 size={14} /> Delete</Button>
            )}
            {canManage && ["sent", "partially_received"].includes(order.status) && (
              <Button variant="ghost" className="gap-1.5 text-[var(--pt-red)]" onClick={cancelOrder} disabled={!!busy}><Ban size={14} /> Cancel</Button>
            )}
          </div>

          {/* Lines */}
          <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_8rem_7rem_7rem_7rem_2rem] gap-3 px-5 py-3 text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider border-b border-[var(--pt-border)] bg-[var(--pt-muted)]">
              <span>Item</span><span>Pack</span><span className="text-right">Ordered</span><span className="text-right">Received</span>
              <span className="text-right">{canSeeCost ? "Amount" : ""}</span><span />
            </div>
            <div className="divide-y divide-[var(--pt-border)]">
              {visibleItems.map((i) => {
                const qty = lineQty(i)
                const cost = lineCost(i)
                const complete = i.quantity_received >= i.quantity_ordered
                return (
                  <div key={i.id} className="grid grid-cols-2 sm:grid-cols-[1fr_8rem_7rem_7rem_7rem_2rem] gap-x-3 gap-y-1 items-center px-4 sm:px-5 py-3">
                    <div className="col-span-2 sm:col-span-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{i.product_name}{i.product_strength ? ` ${i.product_strength}` : ""}</p>
                      <p className="text-xs text-[var(--pt-text-secondary)]">
                        {i.stock_on_hand != null ? `${i.stock_on_hand} ${i.base_unit ?? "unit"}s on hand` : "Product deleted"}
                        {canSeeCost && cost != null && !editable ? ` · ${formatKES(cost)}/pack` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--pt-text-secondary)]">{i.pack_label ?? (i.units_per_pack > 1 ? `Pack of ${i.units_per_pack}` : i.base_unit ?? "Unit")}</span>
                    <div className="flex sm:justify-end">
                      {editable ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setLine(i, { packs: Math.max(1, qty - 1) })} className="w-7 h-7 rounded-md border border-[var(--pt-border)] flex items-center justify-center" aria-label="Fewer"><Minus size={12} /></button>
                          <input value={qty} inputMode="numeric" aria-label="Packs"
                            onChange={(e) => setLine(i, { packs: Math.max(1, parseInt(e.target.value.replace(/\D/g, "") || "1", 10)) })}
                            className="w-12 h-7 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-center text-sm font-semibold tabular-nums" />
                          <button onClick={() => setLine(i, { packs: qty + 1 })} className="w-7 h-7 rounded-md border border-[var(--pt-border)] flex items-center justify-center" aria-label="More"><Plus size={12} /></button>
                        </div>
                      ) : <span className="text-sm tabular-nums">{qty}</span>}
                    </div>
                    <span className={`text-sm tabular-nums sm:text-right ${complete ? "text-[var(--pt-green-600)] font-semibold" : i.quantity_received > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-[var(--pt-text-tertiary)]"}`}>
                      <span className="sm:hidden text-xs text-[var(--pt-text-secondary)] font-normal">Received </span>{i.quantity_received}
                    </span>
                    <div className="sm:text-right">
                      {canSeeCost && (editable ? (
                        <Input type="number" min={0} step="0.01" value={cost ?? ""} placeholder="cost/pack" aria-label="Cost per pack"
                          onChange={(e) => setLine(i, { cost: e.target.value === "" ? null : Number(e.target.value) })}
                          className="h-8 text-sm tabular-nums text-right" />
                      ) : <span className="text-sm font-semibold tabular-nums">{cost == null ? "—" : formatKES(cost * qty)}</span>)}
                    </div>
                    <div className="flex justify-end">
                      {editable && (
                        <button onClick={() => setLine(i, { removed: true })} aria-label={`Remove ${i.product_name}`}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-[var(--pt-red)]"><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-[var(--pt-border)] bg-[var(--pt-muted)]">
              <span className="text-sm text-[var(--pt-text-secondary)]">{visibleItems.length} items</span>
              <div className="flex items-center gap-3">
                {canSeeCost && <span className="text-base font-bold tabular-nums">Total {formatKES(total)}</span>}
                {editable && dirty && (
                  <Button size="sm" className="gap-1.5" onClick={saveLines} disabled={!!busy}>
                    {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save changes
                  </Button>
                )}
              </div>
            </div>
          </div>

          {order.notes && <p className="mt-4 text-sm bg-[var(--pt-muted)] rounded-xl px-4 py-3 whitespace-pre-line">{order.notes}</p>}
        </>
      )}

      <EmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} order={order} showPrices={pricesVisible}
        onSent={() => { void refetch(); void qc.invalidateQueries({ queryKey: ["purchase-orders"] }) }} />
    </div>
  )
}

function EmailDialog({ open, onClose, order, showPrices, onSent }: {
  open: boolean; onClose: () => void; order: PurchaseOrderDetail; showPrices: boolean; onSent: () => void
}) {
  const [to, setTo] = useState(order.supplier_email ?? "")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  async function send() {
    setSending(true)
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, message: message || undefined, show_prices: showPrices }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to send")
      toast.success(`${order.po_number} emailed to ${to}`)
      onSent()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-md p-6">
        <h2 className="text-lg font-bold">Email {order.po_number}</h2>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-4">The PDF is attached{showPrices ? " with prices" : " without prices"}. Drafts are marked as sent.</p>
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">Supplier email</label>
        <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="orders@supplier.co.ke" className="h-10 mb-3" />
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">Message (optional)</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
          className="w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          placeholder="Anything to add for the supplier…" />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button className="flex-1 gap-2" onClick={send} disabled={sending || !/^\S+@\S+\.\S+$/.test(to)}>
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
