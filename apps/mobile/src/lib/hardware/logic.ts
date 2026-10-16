import type { PaperWidth, PrinterReplies, ReceiptDoc } from "@pharmatrack/core"
import { nairobiDateTime, type ReceiptData } from "../../features/pos/logic/receipt"
import type { InputDeviceInfo, PrinterKind } from "./native"

// Pure parts of Android printing / scanner detection (tested without devices).

export interface PrinterTarget {
  kind: PrinterKind
  /** Bluetooth MAC, network host/IP, or USB "vendorId:productId". */
  address: string
  /** TCP port for network printers (9100 by default). */
  port: number
  /** What staff see, e.g. "XP-P58 (Bluetooth)". */
  label: string
}

export interface PrinterSettings {
  target: PrinterTarget | null
  /** null = the organisation's default (Settings → Organisation). */
  paper: PaperWidth | null
  autoPrint: boolean
  openDrawer: boolean
  copies: number
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = { target: null, paper: null, autoPrint: false, openDrawer: false, copies: 1 }

/** The till's receipt (cents already) → the shared ESC/POS receipt model. */
export function receiptDocFromReceipt(r: ReceiptData, extra?: { branchName?: string | null; address?: string | null; phone?: string | null }): ReceiptDoc {
  return {
    shopName: r.shopName,
    branchName: extra?.branchName ?? null,
    address: extra?.address ?? null,
    phone: extra?.phone ?? null,
    receiptNumber: r.receiptNumber,
    dateText: nairobiDateTime(r.soldAtMs),
    cashier: r.cashier,
    lines: r.lines.map((l) => ({ name: l.name, qtyLabel: l.qtyLabel, totalCents: l.totalCents, discountCents: l.discountCents })),
    subtotalCents: r.subtotalCents,
    discountCents: r.discountCents,
    totalCents: r.totalCents,
    paymentLabel: r.paymentLabel,
    paidCents: r.paidCents,
    changeCents: r.changeCents,
    mpesaReference: r.mpesaReference,
  }
}

/** A cash-drawer kick only makes sense when cash changed hands. */
export function isCashPayment(paymentLabel: string): boolean {
  return /cash/i.test(paymentLabel)
}

/**
 * The connected barcode scanner, if any. HID scanners are external keyboard
 * devices; prefer one whose name/keyboard type says "scanner", else any
 * external keyboard (many scanners just call themselves "Keyboard").
 */
export function pickScanner(devices: InputDeviceInfo[]): InputDeviceInfo | null {
  return devices.find((d) => d.likelyScanner) ?? devices[0] ?? null
}

/** Does the printer answer ESC/POS status requests (so paper-out can be shown)? */
export function answersStatus(r: PrinterReplies | null): boolean {
  return !!r && r.reachable && r.printer != null
}

export function targetLabel(kind: PrinterKind, name: string): string {
  return `${name} (${kind === "bluetooth" ? "Bluetooth" : kind === "usb" ? "USB" : "Network"})`
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/

/** Validate a typed network printer address. */
export function parseNetworkTarget(host: string, port: string): { ok: true; host: string; port: number } | { ok: false; error: string } {
  const h = host.trim()
  if (!h || (!IPV4.test(h) && !/^[a-z0-9][a-z0-9.-]*$/i.test(h))) return { ok: false, error: "Enter the printer's IP address, e.g. 192.168.1.100" }
  if (IPV4.test(h) && h.split(".").some((n) => Number(n) > 255)) return { ok: false, error: "That IP address isn't valid" }
  const p = port.trim() ? Number(port) : 9100
  if (!Number.isInteger(p) || p < 1 || p > 65535) return { ok: false, error: "The port is a number, usually 9100" }
  return { ok: true, host: h, port: p }
}
