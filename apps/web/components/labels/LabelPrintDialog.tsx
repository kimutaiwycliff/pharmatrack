"use client"

import { useState } from "react"
import { FileDown, Loader2, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { encodeCode128B, barsFromWidths } from "@pharmatrack/core"
import type { LabelItem, LabelSize } from "./LabelPDF"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: LabelItem[]
  labelSize: LabelSize
}

type Layout = "single" | "sheet"

async function downloadLabelsPDF(items: LabelItem[], labelSize: LabelSize, layout: Layout) {
  const [{ pdf }, { SingleLabelDocument, LabelSheetDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./LabelPDF"),
  ])
  const doc = layout === "single" ? (
    <SingleLabelDocument items={items} labelSize={labelSize} />
  ) : (
    <LabelSheetDocument items={items} />
  )
  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `barcode-labels-${layout}-${Date.now()}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// On-screen preview only — the actual print output comes from the PDF
// documents in LabelPDF.tsx, whose page dimensions are baked into the PDF
// itself. That's deliberately more robust than a live window.print() here:
// this app already has one CSS-variable-driven @page rule for receipts
// (globals.css), and a second, differently-sized @page rule in the same
// stylesheet would silently win for BOTH print flows (@page rules aren't
// scoped to a DOM subtree) — a PDF's own page size has no such conflict.
function BarcodePreview({ code }: { code: string }) {
  const widths = encodeCode128B(code)
  const totalModules = widths.reduce((a, b) => a + b, 0)
  const moduleWidth = 1.4
  const rects = barsFromWidths(widths, moduleWidth)
  const width = totalModules * moduleWidth
  return (
    <svg width={width} height={32} viewBox={`0 0 ${width} 32`}>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.width} height={32} fill="currentColor" />
      ))}
    </svg>
  )
}

export function LabelPrintDialog({ open, onOpenChange, items, labelSize }: Props) {
  const [loading, setLoading] = useState<Layout | null>(null)

  async function handleDownload(layout: Layout) {
    setLoading(layout)
    try {
      await downloadLabelsPDF(items, labelSize, layout)
    } finally {
      setLoading(null)
    }
  }

  const totalLabels = items.reduce((sum, i) => sum + Math.max(1, i.copies), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag size={16} /> Print Barcode Labels
          </DialogTitle>
          <DialogDescription>
            {items.length} product{items.length !== 1 ? "s" : ""}, {totalLabels} label{totalLabels !== 1 ? "s" : ""} total.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] overflow-y-auto grid grid-cols-2 gap-3 py-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="border border-dashed border-[var(--pt-border-strong)] rounded-lg p-3 flex flex-col items-center gap-1 text-[var(--pt-text)]"
            >
              <p className="text-[10px] font-semibold text-center truncate w-full">{item.productName}</p>
              <BarcodePreview code={item.code} />
              <p className="text-[10px] font-mono text-[var(--pt-text-secondary)]">{item.code}</p>
              {item.copies > 1 && (
                <p className="text-[10px] text-[var(--pt-text-tertiary)]">× {item.copies}</p>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => handleDownload("single")}
            disabled={loading !== null}
            className="gap-1.5 text-xs h-10"
          >
            {loading === "single" ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Download for label printer ({labelSize})
          </Button>
          <Button
            variant="outline"
            onClick={() => handleDownload("sheet")}
            disabled={loading !== null}
            className="gap-1.5 text-xs h-10"
          >
            {loading === "sheet" ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Download A4 sheet (any printer)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
