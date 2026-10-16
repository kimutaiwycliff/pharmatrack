// Device health shown in the POS header on every client: the receipt printer
// and the barcode scanner, each green (ready), amber (needs attention / can't
// tell) or red (offline). The parsing of the printer's DLE EOT replies lives
// here so web, Android and desktop agree on what a status byte means.

export type DeviceTone = "ok" | "warn" | "down" | "none"

export interface DeviceHealth {
  tone: DeviceTone
  /** Short badge text, e.g. "Printer ready". */
  label: string
  /** One sentence for the tooltip / settings screen. */
  detail?: string
}

/** A real-time status byte is valid when bits 1 and 4 are set and 0 and 7 clear. */
export function isStatusByte(b: number | null | undefined): b is number {
  return typeof b === "number" && (b & 0x93) === 0x12
}

export interface PrinterReplies {
  /** The transport opened / the device is attached and paired. */
  reachable: boolean
  /** DLE EOT 1 (printer status) reply byte, if the printer answered. */
  printer?: number | null
  /** DLE EOT 2 (offline cause). */
  offline?: number | null
  /** DLE EOT 4 (paper roll sensor). */
  paper?: number | null
  /** The transport's own error, when not reachable. */
  error?: string | null
}

export interface PrinterFlags {
  answered: boolean
  offline: boolean
  coverOpen: boolean
  paperOut: boolean
  paperLow: boolean
}

export function printerFlags(r: PrinterReplies): PrinterFlags {
  const p = isStatusByte(r.printer) ? r.printer : null
  const o = isStatusByte(r.offline) ? r.offline : null
  const s = isStatusByte(r.paper) ? r.paper : null
  return {
    answered: p !== null || o !== null || s !== null,
    offline: p !== null && (p & 0x08) !== 0,
    coverOpen: o !== null && (o & 0x04) !== 0,
    paperOut: (o !== null && (o & 0x20) !== 0) || (s !== null && (s & 0x60) !== 0),
    paperLow: s !== null && (s & 0x0c) !== 0,
  }
}

/** What the printer badge should say. */
export function printerHealth(r: PrinterReplies | null, configured: boolean): DeviceHealth {
  if (!configured) return { tone: "none", label: "No printer", detail: "Set up a receipt printer in Settings → Printer & scanner." }
  if (!r) return { tone: "warn", label: "Printer…", detail: "Checking the printer." }
  if (!r.reachable) return { tone: "down", label: "Printer offline", detail: r.error ?? "Can't reach the printer — check it's on, paired or plugged in, and in range." }
  const f = printerFlags(r)
  if (f.paperOut) return { tone: "down", label: "Out of paper", detail: "Load a new paper roll." }
  if (f.coverOpen) return { tone: "down", label: "Cover open", detail: "Close the printer cover." }
  if (f.offline) return { tone: "down", label: "Printer offline", detail: "The printer reports it is offline (error or paper)." }
  if (f.paperLow) return { tone: "warn", label: "Paper low", detail: "The paper roll is nearly finished." }
  if (!f.answered) return { tone: "ok", label: "Printer connected", detail: "Connected. This printer doesn't report paper status, so keep an eye on the roll." }
  return { tone: "ok", label: "Printer ready" }
}

export interface ScannerSignals {
  /** Native connect/disconnect signal (Android); null/undefined where the platform can't tell. */
  connected?: boolean | null
  /** Device name, when known. */
  name?: string | null
  /** When the last hardware scan arrived (ms since epoch). */
  lastScanAt?: number | null
  now: number
}

function ago(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

/**
 * What the scanner badge should say. Android knows when a Bluetooth/USB
 * scanner connects; browsers and the desktop can't see keyboard-type devices,
 * so there the badge works from the last scan instead.
 */
export function scannerHealth(s: ScannerSignals): DeviceHealth {
  const name = s.name ? ` (${s.name})` : ""
  const last = s.lastScanAt ? `Last scan ${ago(s.now - s.lastScanAt)}.` : "No scans yet."
  if (s.connected === true) return { tone: "ok", label: "Scanner connected", detail: `Connected${name}. ${last}` }
  if (s.connected === false) {
    return { tone: "down", label: "Scanner disconnected", detail: "No scanner connected — check it's switched on and paired, or use the camera." }
  }
  if (s.lastScanAt && s.now - s.lastScanAt < 30 * 60_000) return { tone: "ok", label: "Scanner working", detail: last }
  return { tone: "warn", label: s.lastScanAt ? "Scanner idle" : "Scanner: no scans yet", detail: `${last} Scan any barcode to check it works.` }
}
