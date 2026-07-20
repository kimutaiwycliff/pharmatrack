"use client"

import { useState, type CSSProperties } from "react"
import { Check, Printer, ArrowRight, FileDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { formatKES } from "@/lib/store/cartStore"
import type { Sale, SaleItem } from "@pharmatrack/types"

interface ReceiptData {
  sale: Sale
  items: SaleItem[]
  branchName: string
  branchAddress: string | null
  orgName: string
  paperWidth?: "58mm" | "80mm"
}

interface Props {
  open: boolean
  data: ReceiptData | null
  onNewSale: () => void
  closeLabel?: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

async function downloadPDF(data: ReceiptData) {
  const [{ pdf }, { ReceiptPDFDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./ReceiptPDF"),
  ])
  const blob = await pdf(
    <ReceiptPDFDocument
      sale={data.sale}
      items={data.items}
      orgName={data.orgName}
      branchName={data.branchName}
      branchAddress={data.branchAddress}
      paperWidth={data.paperWidth}
    />,
  ).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `receipt-${data.sale.receipt_number}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export function ReceiptModal({ open, data, onNewSale, closeLabel = "New sale" }: Props) {
  const [pdfLoading, setPdfLoading] = useState(false)

  async function handlePDF() {
    if (!data) return
    setPdfLoading(true)
    try {
      await downloadPDF(data)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onNewSale()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[460px] p-0 gap-0 overflow-hidden rounded-2xl"
      >
        {data && (
          <>
            {/* Success header */}
            <div className="px-6 pt-6 pb-4 text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--pt-green-50)] flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-[var(--pt-green)]" />
              </div>
              <h2 className="text-xl font-bold text-[var(--pt-green-600)]">Sale Complete</h2>
              <p className="text-sm text-[var(--pt-text-secondary)] mt-1">
                {data.sale.payment_method === "mpesa" ? "M-Pesa confirmed" : "Payment received"}
              </p>
            </div>

            {/* Thermal receipt */}
            <div className="px-7 pb-2">
              <div
                id="receipt-printable"
                style={{ "--pt-receipt-width": data.paperWidth ?? "80mm" } as CSSProperties}
                className="border border-dashed border-[var(--pt-border-strong)] rounded-xl p-5 font-mono text-[11px] space-y-2"
              >
                <div className="text-center space-y-0.5">
                  <p className="font-bold text-[13px] tracking-widest uppercase">
                    {data.orgName}
                  </p>
                  <p className="uppercase tracking-wide">{data.branchName}</p>
                  {data.branchAddress && (
                    <p className="text-[var(--pt-text-secondary)]">{data.branchAddress}</p>
                  )}
                </div>

                <hr className="border-dashed border-[var(--pt-border-strong)]" />

                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-[var(--pt-text-secondary)]">Receipt</span>
                    <span className="font-semibold">{data.sale.receipt_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--pt-text-secondary)]">Date</span>
                    <span>{formatDate(data.sale.created_at)}</span>
                  </div>
                </div>

                <hr className="border-dashed border-[var(--pt-border-strong)]" />

                <div className="space-y-0.5">
                  {data.items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span className="truncate max-w-[220px]">
                        {item.product_name} × {item.quantity} {item.base_unit}
                      </span>
                      <span className="tabular-nums">{formatKES(item.line_total)}</span>
                    </div>
                  ))}
                </div>

                <hr className="border-dashed border-[var(--pt-border-strong)]" />

                {data.sale.discount_amount > 0 && (
                  <div className="flex justify-between text-[var(--pt-text-secondary)]">
                    <span>Discount</span>
                    <span className="tabular-nums">- {formatKES(data.sale.discount_amount)}</span>
                  </div>
                )}

                <div className="flex justify-between font-bold text-[13px]">
                  <span>TOTAL</span>
                  <span className="tabular-nums">{formatKES(data.sale.total_amount)}</span>
                </div>

                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-[var(--pt-text-secondary)]">Paid</span>
                    <span className="capitalize font-semibold">{data.sale.payment_method}</span>
                  </div>
                  {data.sale.mpesa_reference && (
                    <div className="flex justify-between">
                      <span className="text-[var(--pt-text-secondary)]">Ref</span>
                      <span className="tracking-widest">{data.sale.mpesa_reference}</span>
                    </div>
                  )}
                  {data.sale.change_given != null && data.sale.change_given > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[var(--pt-text-secondary)]">Change</span>
                      <span className="tabular-nums">{formatKES(data.sale.change_given)}</span>
                    </div>
                  )}
                </div>

                <hr className="border-dashed border-[var(--pt-border-strong)]" />
                <p className="text-center text-[var(--pt-text-secondary)]">
                  Thank you for your business
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="gap-1.5 text-xs h-10"
              >
                <Printer size={14} />
                Print
              </Button>
              <Button variant="outline" onClick={handlePDF} disabled={pdfLoading} className="gap-1.5 text-xs h-10">
                {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                PDF
              </Button>
              <Button
                onClick={onNewSale}
                className="gap-1.5 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white text-xs h-10"
              >
                {closeLabel}
                {closeLabel === "New sale" && <ArrowRight size={14} />}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
