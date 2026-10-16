// The thermal receipt, laid out once for every printer: rows of text with a
// little styling, fitted to the paper (58 mm = 32 characters per line,
// 80 mm = 48, Font A). `receiptRows` is the layout, `receiptPreview` its plain
// text (tests, on-screen previews) and `encodeReceipt` the ESC/POS bytes.
// Money is integer cents throughout.
import { formatKES, type Cents } from "../money"
import { EscPos, toPrinterText, type Align } from "./escpos"

export type PaperWidth = "58mm" | "80mm"

export const PAPER_COLUMNS: Record<PaperWidth, number> = { "58mm": 32, "80mm": 48 }

export interface ReceiptDocLine {
  name: string
  /** "2 x Strip of 10" / "3 tablets". */
  qtyLabel: string
  totalCents: Cents
  discountCents?: Cents
}

export interface ReceiptDoc {
  shopName: string
  branchName?: string | null
  address?: string | null
  phone?: string | null
  /** Registration / PIN line printed under the header when set. */
  registration?: string | null
  receiptNumber: string
  /** Already formatted in Africa/Nairobi, e.g. "15/10/2026 14:05". */
  dateText: string
  cashier?: string | null
  customer?: string | null
  lines: ReceiptDocLine[]
  subtotalCents: Cents
  discountCents: Cents
  totalCents: Cents
  paymentLabel: string
  paidCents?: Cents | null
  changeCents?: Cents | null
  mpesaReference?: string | null
  footer?: string | null
  /** Printed as a QR code under the footer (e.g. a receipt link). */
  qrData?: string | null
}

export interface ReceiptRow {
  text: string
  align?: Align
  bold?: boolean
  /** Double width + height (shop name, total): half as many columns. */
  big?: boolean
}

/** Words wrapped to `width`; over-long words are hard-split. */
export function wrapText(s: string, width: number): string[] {
  const words = toPrinterText(s).split(/\s+/).filter(Boolean)
  const out: string[] = []
  let cur = ""
  for (let w of words) {
    while (w.length > width) {
      if (cur) { out.push(cur); cur = "" }
      out.push(w.slice(0, width))
      w = w.slice(width)
    }
    if (!cur) cur = w
    else if (cur.length + 1 + w.length <= width) cur += ` ${w}`
    else { out.push(cur); cur = w }
  }
  if (cur) out.push(cur)
  return out.length ? out : [""]
}

/** "Label        value" on one line; the label is cut short, never the value. */
export function pairLine(left: string, right: string, width: number): string {
  const l = toPrinterText(left)
  const r = toPrinterText(right)
  const room = width - r.length - 1
  if (room < 1) return r.slice(0, width)
  const label = l.length > room ? l.slice(0, Math.max(0, room - 1)) + "." : l
  return label + " ".repeat(width - label.length - r.length) + r
}

export function receiptRows(doc: ReceiptDoc, paper: PaperWidth): ReceiptRow[] {
  const w = PAPER_COLUMNS[paper]
  const half = Math.floor(w / 2)
  const rule: ReceiptRow = { text: "-".repeat(w) }
  const rows: ReceiptRow[] = []
  const center = (text: string, extra: Partial<ReceiptRow> = {}) =>
    wrapText(text, extra.big ? half : w).forEach((t) => rows.push({ text: t, align: "center", ...extra }))
  const pair = (l: string, r: string, extra: Partial<ReceiptRow> = {}) => rows.push({ text: pairLine(l, r, w), ...extra })

  center(doc.shopName.toUpperCase(), { bold: true, big: true })
  if (doc.branchName) center(doc.branchName)
  if (doc.address) center(doc.address)
  if (doc.phone) center(`Tel: ${doc.phone}`)
  if (doc.registration) center(doc.registration)
  rows.push(rule)

  pair("Receipt", doc.receiptNumber)
  pair("Date", doc.dateText)
  if (doc.cashier) pair("Served by", doc.cashier)
  if (doc.customer) pair("Customer", doc.customer)
  rows.push(rule)

  for (const l of doc.lines) {
    for (const t of wrapText(l.name, w)) rows.push({ text: t, bold: true })
    pair(`  ${l.qtyLabel}`, formatKES(l.totalCents))
    if (l.discountCents && l.discountCents > 0) pair("  Discount", `-${formatKES(l.discountCents)}`)
  }
  rows.push(rule)

  if (doc.discountCents > 0) {
    pair("Subtotal", formatKES(doc.subtotalCents))
    pair("Discount", `-${formatKES(doc.discountCents)}`)
  }
  // The total prints double size when it fits in half the columns.
  const total = formatKES(doc.totalCents)
  if (total.length + 6 <= half) rows.push({ text: pairLine("TOTAL", total, half), bold: true, big: true })
  else pair("TOTAL", total, { bold: true })
  pair(`Paid (${doc.paymentLabel})`, formatKES(doc.paidCents ?? doc.totalCents))
  if (doc.changeCents && doc.changeCents > 0) pair("Change", formatKES(doc.changeCents))
  if (doc.mpesaReference) pair("M-Pesa ref", doc.mpesaReference)
  rows.push(rule)

  center(doc.footer ?? "Thank you - get well soon")
  return rows
}

/** The receipt as plain text lines (what the printer prints, minus styling). */
export function receiptPreview(doc: ReceiptDoc, paper: PaperWidth): string[] {
  const w = PAPER_COLUMNS[paper]
  return receiptRows(doc, paper).map((r) => {
    const width = r.big ? Math.floor(w / 2) : w
    if (r.align === "center") return " ".repeat(Math.max(0, Math.floor((width - r.text.length) / 2))) + r.text
    if (r.align === "right") return r.text.padStart(width)
    return r.text
  })
}

export interface EncodeOptions {
  paper: PaperWidth
  /** Pulse the cash drawer (cash sales). */
  openDrawer?: boolean
  /** Cut after printing (default true; printers without a cutter ignore it). */
  cut?: boolean
  /** Copies, each cut separately (e.g. a shop copy); 1–3. */
  copies?: number
}

/** ESC/POS bytes for a receipt, ready for any transport. */
export function encodeReceipt(doc: ReceiptDoc, opts: EncodeOptions): Uint8Array {
  const p = new EscPos().init()
  if (opts.openDrawer) p.openDrawer()
  const copies = Math.min(3, Math.max(1, Math.round(opts.copies ?? 1)))
  for (let c = 0; c < copies; c++) {
    for (const r of receiptRows(doc, opts.paper)) {
      p.align(r.align ?? "left").bold(!!r.bold).size(r.big ? 2 : 1, r.big ? 2 : 1).line(r.text)
    }
    p.size(1, 1).bold(false)
    if (doc.qrData) p.align("center").qr(doc.qrData, opts.paper === "58mm" ? 4 : 6).line()
    p.align("left").feed(3)
    if (opts.cut !== false) p.cut()
  }
  return p.bytes()
}

/** A short self-test page: proves the connection, paper width and cutter. */
export function encodeTestPage(info: { paper: PaperWidth; printerName: string; shopName?: string | null; when: string }): Uint8Array {
  const w = PAPER_COLUMNS[info.paper]
  const p = new EscPos().init().align("center").bold(true).size(2, 2).line("TEST PRINT").size(1, 1).bold(false)
  p.line(info.shopName ?? "PharmaTrack").line("-".repeat(w)).align("left")
  p.line(pairLine("Printer", info.printerName, w)).line(pairLine("Paper", `${info.paper} (${w} chars)`, w)).line(pairLine("Time", info.when, w))
  p.line("0123456789".repeat(Math.ceil(w / 10)).slice(0, w))
  p.align("center").line("Centred text and a ruler that").line("fits the paper = all set.").feed(3).cut()
  return p.bytes()
}
