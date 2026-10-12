import { nairobiYYMMDD } from "./time"

// Device receipt numbers: `${deviceCode}-${YYMMDD Nairobi}-${4-digit daily
// counter}` (e.g. D01-261012-0007). Unique per device without a server round
// trip — the server only requires /^[A-Z0-9]{2,6}-\d{6}-\d{4,6}$/.

export const RECEIPT_RE = /^[A-Z0-9]{2,6}-\d{6}-\d{4,6}$/

/** Upper-case alphanumerics, 2–6 chars (the server's device codes are "D01"…). */
export function sanitizeDeviceCode(code: string | null | undefined): string {
  const clean = (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
  return clean.length >= 2 ? clean : "D00"
}

export function formatReceiptNumber(deviceCode: string, atMs: number, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 999_999) throw new Error(`Bad receipt sequence: ${seq}`)
  return `${sanitizeDeviceCode(deviceCode)}-${nairobiYYMMDD(atMs)}-${String(seq).padStart(4, "0")}`
}

/** Next sequence for `dateKey`: restarts at 1 every Nairobi day. */
export function nextReceiptSeq(prev: { dateKey: string; lastSeq: number } | null, dateKey: string): number {
  return prev && prev.dateKey === dateKey ? prev.lastSeq + 1 : 1
}
