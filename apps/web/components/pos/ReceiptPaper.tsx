"use client"

import { useMemo, type CSSProperties } from "react"
import {
  formatKES, qrPath, receiptFooterLines, receiptHeaderLines, receiptQtyText,
  type PaperWidth, type ReceiptDoc,
} from "@pharmatrack/core"

// One receipt on screen, drawn from the shared ReceiptDoc — the same doc the
// thermal printer and the PDF get, so what the owner previews in Settings →
// Receipt is what the till hands the customer. Monospace like the paper.

const WIDTH: Record<PaperWidth, number> = { "58mm": 248, "80mm": 320 }

function Rule() {
  return <hr className="border-0 border-t border-dashed border-[var(--pt-border-strong)] my-2" />
}

function Pair({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold text-[13px]" : ""}`}>
      <span className={muted ? "text-[var(--pt-text-secondary)]" : undefined}>{label}</span>
      <span className="tabular-nums text-right">{value}</span>
    </div>
  )
}

function Qr({ data }: { data: string }) {
  const { size, d } = useMemo(() => qrPath(data), [data])
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={96} height={96} shapeRendering="crispEdges" role="img" aria-label="QR code" className="mx-auto">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}

export function ReceiptPaper({ doc, paper = "80mm", id, className = "" }: { doc: ReceiptDoc; paper?: PaperWidth; id?: string; className?: string }) {
  const header = receiptHeaderLines(doc)
  const footer = receiptFooterLines(doc)
  return (
    <div
      id={id}
      style={{ "--pt-receipt-width": paper, maxWidth: WIDTH[paper] } as CSSProperties}
      className={`mx-auto w-full bg-[var(--pt-surface)] border border-dashed border-[var(--pt-border-strong)] rounded-xl p-4 font-mono text-[11px] leading-snug text-[var(--pt-text)] ${className}`}
    >
      <div className="text-center space-y-0.5">
        {doc.logoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- inline data URL, nothing to optimise
          <img src={doc.logoDataUrl} alt="" className="mx-auto mb-1.5 max-h-16 max-w-[70%] object-contain" />
        )}
        <p className="font-bold text-[13px] tracking-widest uppercase break-words">{doc.shopName}</p>
        {header.map((l, i) => (
          <p key={i} className="text-[var(--pt-text-secondary)] break-words">{l}</p>
        ))}
      </div>

      <Rule />
      <div className="space-y-0.5">
        <Pair label="Receipt" value={doc.receiptNumber} muted />
        <Pair label="Date" value={doc.dateText} muted />
        {doc.cashier && <Pair label="Served by" value={doc.cashier} muted />}
        {doc.customer && <Pair label="Customer" value={doc.customer} muted />}
      </div>

      <Rule />
      <div className="space-y-1">
        {doc.lines.map((l, i) => (
          <div key={i}>
            <p className="font-semibold break-words">{l.name}</p>
            <Pair label={`  ${receiptQtyText(l)}`} value={formatKES(l.totalCents)} muted />
            {l.discountCents ? <Pair label="  Discount" value={`-${formatKES(l.discountCents)}`} muted /> : null}
          </div>
        ))}
      </div>

      <Rule />
      <div className="space-y-0.5">
        {doc.discountCents > 0 && (
          <>
            <Pair label="Subtotal" value={formatKES(doc.subtotalCents)} muted />
            <Pair label="Discount" value={`-${formatKES(doc.discountCents)}`} muted />
          </>
        )}
        <Pair label="TOTAL" value={formatKES(doc.totalCents)} strong />
        <Pair label={`Paid (${doc.paymentLabel})`} value={formatKES(doc.paidCents ?? doc.totalCents)} muted />
        {doc.changeCents ? <Pair label="Change" value={formatKES(doc.changeCents)} muted /> : null}
        {doc.mpesaReference && <Pair label="M-Pesa ref" value={doc.mpesaReference} muted />}
      </div>

      {footer.length > 0 && (
        <>
          <Rule />
          <div className="text-center space-y-0.5">
            {footer.map((l, i) => <p key={i} className="break-words">{l}</p>)}
          </div>
        </>
      )}

      {doc.qrData && (
        <div className="mt-3 text-center space-y-1">
          <Qr data={doc.qrData} />
          {doc.qrCaption && <p className="text-[var(--pt-text-secondary)]">{doc.qrCaption}</p>}
        </div>
      )}
    </div>
  )
}
