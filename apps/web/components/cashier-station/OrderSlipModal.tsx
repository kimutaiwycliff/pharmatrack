"use client"

import { Printer, Send } from "lucide-react"
import { barcodeSvgMarkup } from "@pharmatrack/core"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatKES } from "@/lib/store/cartStore"
import type { StationOrder } from "@/lib/cashier-station/client"
import { OrderBarcode } from "./OrderBarcode"

// Shown at the order desk after "Send to cashier": the number the customer
// takes to the cashier. Printing gives them a slip with the barcode.
export function OrderSlipModal({ order, branchName, onClose }: { order: StationOrder | null; branchName: string; onClose: () => void }) {
  function printSlip() {
    if (!order) return
    const w = window.open("", "_blank", "width=360,height=520")
    if (!w) return
    const lines = (order.lines ?? []).map((l) => `<tr><td>${escapeHtml(l.product_name)}</td><td style="text-align:right">${l.quantity}</td></tr>`).join("")
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${order.label}</title>
      <style>body{font-family:system-ui,sans-serif;width:72mm;margin:0 auto;padding:8px;text-align:center}
      h1{font-size:44px;margin:4px 0}table{width:100%;font-size:12px;border-collapse:collapse;text-align:left}
      .t{font-size:18px;font-weight:700;margin:8px 0}.s{font-size:11px;color:#444}</style></head>
      <body><div class="s">${escapeHtml(branchName)}</div><div class="s">PAY AT THE CASHIER</div><h1>${order.label}</h1>
      ${barcodeSvgMarkup(order.label, { height: 50, includeText: false })}
      <div class="t">${formatKES(order.total_amount)}</div><table>${lines}</table>
      <div class="s" style="margin-top:8px">Valid until ${new Date(order.expires_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</div>
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script></body></html>`)
    w.document.close()
  }

  return (
    <Dialog open={order !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[400px] p-0 gap-0 overflow-hidden rounded-2xl">
        {order && (
          <div className="p-6 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-600)] flex items-center justify-center">
              <Send size={18} />
            </div>
            <p className="mt-3 text-sm text-[var(--pt-text-secondary)]">Sent to the cashier. Tell the customer to pay for</p>
            <div className="mt-1 text-5xl font-black tracking-tight tabular-nums">{order.label}</div>
            <div className="mt-2 text-lg font-bold tabular-nums">{formatKES(order.total_amount)}</div>
            <div className="mt-4 flex justify-center"><OrderBarcode text={order.label} /></div>
            <p className="mt-3 text-xs text-[var(--pt-text-tertiary)]">
              Held for the customer until {new Date(order.expires_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={printSlip}><Printer size={16} className="mr-1.5" />Print slip</Button>
              <Button onClick={onClose} autoFocus>Next customer</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
}
