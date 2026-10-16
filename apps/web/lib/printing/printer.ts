"use client"

// One place the web app prints a receipt: picks the transport this till is set
// up for (Settings → Printer & scanner), sends the shared ESC/POS bytes from
// @pharmatrack/core, and checks printer health for the POS header badge.
import {
  encodeReceipt, encodeTestPage, type PaperWidth, type PrinterReplies, type ReceiptDoc,
} from "@pharmatrack/core"
import type { Sale, SaleItem } from "@pharmatrack/types"
import { hasDirectPrinter, type DesktopTarget, type PrinterConfig } from "./config"
import { serialPrint, serialStatus } from "./webSerial"

// ── Desktop app bridge (apps/desktop/src-tauri/src/printing.rs) ────────────
type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

function tauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") return null
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }).__TAURI_INTERNALS__
  return internals?.invoke ?? null
}

/** Running inside the PharmaTrack desktop app (with native printing)? */
export function isDesktopApp(): boolean {
  return tauriInvoke() !== null
}

export interface DesktopPrinters {
  /** Printers installed in Windows/macOS (sent raw — no driver formatting). */
  system: string[]
  /** COM / tty ports — USB-serial and paired Bluetooth printers. */
  serial: Array<{ path: string; label: string }>
}

export async function listDesktopPrinters(): Promise<DesktopPrinters> {
  const invoke = tauriInvoke()
  if (!invoke) throw new Error("Open PharmaTrack in the desktop app to use its printers.")
  return invoke<DesktopPrinters>("pt_list_printers")
}

async function desktopPrint(target: DesktopTarget, bytes: Uint8Array): Promise<void> {
  const invoke = tauriInvoke()
  if (!invoke) throw new Error("The desktop app's printing isn't available here — open PharmaTrack in the desktop app.")
  await invoke("pt_print", { target, data: Array.from(bytes) })
}

async function desktopStatus(target: DesktopTarget): Promise<PrinterReplies> {
  const invoke = tauriInvoke()
  if (!invoke) return { reachable: false, error: "Open PharmaTrack in the desktop app to use this printer." }
  try {
    return await invoke<PrinterReplies>("pt_printer_status", { target })
  } catch (err) {
    return { reachable: false, error: String(err) }
  }
}

// ── Transport-agnostic API ─────────────────────────────────────────────────

function stripLabel<T extends { label?: string }>(t: T): Omit<T, "label"> {
  const rest: Partial<T> = { ...t }
  delete rest.label
  return rest as Omit<T, "label">
}

/** Send raw ESC/POS bytes to this till's direct printer. */
export async function printBytes(config: PrinterConfig, bytes: Uint8Array): Promise<void> {
  if (config.mode === "serial" && config.serial) return serialPrint(config.serial, bytes)
  if (config.mode === "desktop" && config.desktop) return desktopPrint(stripLabel(config.desktop) as DesktopTarget, bytes)
  throw new Error("No direct printer is set up on this till.")
}

/** Health of this till's direct printer (null when it prints through the browser). */
export async function checkPrinter(config: PrinterConfig): Promise<PrinterReplies | null> {
  if (!hasDirectPrinter(config)) return null
  if (config.mode === "serial") return serialStatus(config.serial!)
  return desktopStatus(stripLabel(config.desktop!) as DesktopTarget)
}

export function paperFor(config: PrinterConfig, orgDefault?: string | null): PaperWidth {
  if (config.paper) return config.paper
  return orgDefault === "58mm" ? "58mm" : "80mm"
}

export async function printReceipt(config: PrinterConfig, doc: ReceiptDoc, opts: { paper: PaperWidth; cash: boolean }): Promise<void> {
  await printBytes(config, encodeReceipt(doc, {
    paper: opts.paper, openDrawer: config.openDrawer && opts.cash, copies: config.copies,
  }))
}

export async function printTestPage(config: PrinterConfig, paper: PaperWidth, shopName?: string | null): Promise<void> {
  const label = config.mode === "serial" ? config.serial?.label : config.desktop?.label
  await printBytes(config, encodeTestPage({ paper, printerName: label ?? "Printer", shopName, when: nairobiDateTime(new Date()) }))
}

/** "15/10/2026 14:05" in Africa/Nairobi. */
export function nairobiDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d).replace(",", "")
}

const cents = (kes: number | null | undefined) => Math.round(Number(kes ?? 0) * 100)
const PAYMENT_LABEL: Record<string, string> = { cash: "Cash", mpesa: "M-Pesa", card: "Card", split: "Cash + M-Pesa" }

/** The web POS's sale (amounts in KES) → the shared receipt model (cents). */
export function receiptDocFromSale(d: {
  sale: Sale
  items: SaleItem[]
  orgName: string
  branchName: string
  branchAddress: string | null
  cashierName?: string | null
}): ReceiptDoc {
  const tendered = d.sale.amount_tendered
  return {
    shopName: d.orgName,
    branchName: d.branchName,
    address: d.branchAddress,
    receiptNumber: d.sale.receipt_number,
    dateText: nairobiDateTime(new Date(d.sale.created_at)),
    cashier: d.cashierName ?? null,
    customer: d.sale.customer_name,
    lines: d.items.map((i) => ({
      name: [i.product_name, i.product_strength].filter(Boolean).join(" "),
      qtyLabel: `${i.quantity} ${i.base_unit ?? "unit"} @ ${Number(i.unit_price ?? 0).toFixed(2)}`,
      totalCents: cents(i.line_total),
    })),
    subtotalCents: cents(d.sale.subtotal),
    discountCents: cents(d.sale.discount_amount),
    totalCents: cents(d.sale.total_amount),
    paymentLabel: PAYMENT_LABEL[d.sale.payment_method] ?? d.sale.payment_method,
    paidCents: tendered != null ? cents(tendered) : cents(d.sale.total_amount),
    changeCents: cents(d.sale.change_given),
    mpesaReference: d.sale.mpesa_reference,
  }
}
