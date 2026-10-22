"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Printer, ArrowRight, FileDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { toast } from "sonner"
import { hasDirectPrinter, usePrinterConfig, useDeviceStore } from "@/lib/printing/config"
import { checkPrinter, paperFor, printReceipt, receiptDocFromSale } from "@/lib/printing/printer"
import { useReceiptProfile } from "@/lib/printing/useReceiptProfile"
import type { PaperWidth, ReceiptDoc } from "@pharmatrack/core"
import type { Sale, SaleItem } from "@pharmatrack/types"
import { ReceiptPaper } from "./ReceiptPaper"

interface ReceiptData {
  sale: Sale
  items: SaleItem[]
  branchName: string
  branchAddress: string | null
  branchPhone?: string | null
  cashierName?: string | null
  orgName: string
  paperWidth?: "58mm" | "80mm"
}

interface Props {
  open: boolean
  data: ReceiptData | null
  onNewSale: () => void
  closeLabel?: string
  /** A sale just completed (not a reprint): honour the till's auto-print setting. */
  autoPrint?: boolean
}

async function downloadPDF(doc: ReceiptDoc, paper: PaperWidth) {
  const [{ pdf }, { ReceiptPDFDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./ReceiptPDF"),
  ])
  const blob = await pdf(<ReceiptPDFDocument doc={doc} paperWidth={paper} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `receipt-${doc.receiptNumber}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export function ReceiptModal({ open, data, onNewSale, closeLabel = "New sale", autoPrint = false }: Props) {
  const [pdfLoading, setPdfLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const config = usePrinterConfig((s) => s.config)
  const paper = data ? paperFor(config, data.paperWidth) : "80mm"
  // Settings → Receipt branding; until it loads the plain layout is used.
  const { data: profile } = useReceiptProfile()
  const doc = useMemo(() => (data ? receiptDocFromSale(data, profile) : null), [data, profile])

  // Direct printer (Settings → Printer & scanner) when set up; otherwise, or if
  // it fails, the browser's print dialog.
  async function handlePrint() {
    if (!data || !doc) return
    if (!hasDirectPrinter(config)) { window.print(); return }
    setPrinting(true)
    try {
      await printReceipt(config, doc, { paper, cash: data.sale.payment_method === "cash" || data.sale.payment_method === "split" })
      toast.success("Receipt sent to the printer")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reach the printer", {
        action: { label: "Use print dialog", onClick: () => window.print() },
        duration: 8000,
      })
    } finally {
      setPrinting(false)
      void checkPrinter(config).then((r) => useDeviceStore.getState().setPrinter(r))
    }
  }

  // Auto-print once per new sale when the till is set up for it.
  const autoPrinted = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !data || !autoPrint || !config.autoPrint) return
    if (autoPrinted.current === data.sale.receipt_number) return
    autoPrinted.current = data.sale.receipt_number
    const t = setTimeout(() => void handlePrint(), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data?.sale.receipt_number, autoPrint, config.autoPrint])

  async function handlePDF() {
    if (!doc) return
    setPdfLoading(true)
    try {
      await downloadPDF(doc, paper)
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
        {data && doc && (
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

            {/* Thermal receipt — the same doc the printer and the PDF get */}
            <div className="px-7 pb-2 max-h-[55vh] overflow-y-auto">
              <style>{`@media print { @page { size: ${paper} auto; margin: 0; } }`}</style>
              <ReceiptPaper id="receipt-printable" doc={doc} paper={paper} />
            </div>

            {/* Actions */}
            <div className="p-5 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={() => void handlePrint()}
                disabled={printing}
                className="gap-1.5 text-xs h-10"
              >
                {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
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
