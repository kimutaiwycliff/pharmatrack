import { normalizeGTIN, parseBarcode, parseGS1 } from "@pharmatrack/core"
import { toISODate } from "../dates"

// R3: what a pack scan tells a receiving form — the product's GTIN plus, for
// GS1 DataMatrix / GS1-128, the batch (AI 10) and expiry (AI 17). The phone
// camera returns GS1 element strings WITHOUT the "]d2" symbology prefix, so a
// bare "01<14 digits>…" string is parsed as GS1 too (core's isGS1() only
// recognises prefixed / FNC1-separated input from keyboard-wedge scanners).

export interface ScanFields {
  raw: string
  gtin: string | null
  batchNumber: string | null
  /** YYYY-MM-DD */
  expiry: string | null
}

const BARE_GS1 = /^01\d{14}/

export function scanFields(raw: string): ScanFields {
  const code = raw.trim()
  let ev: { gtin?: string; batchNumber?: string; expiryDate?: Date } = parseBarcode(code)
  if (!ev.batchNumber && !ev.expiryDate && BARE_GS1.test(code)) {
    const gs1 = parseGS1(code)
    ev = gs1.gtin ? gs1 : { gtin: normalizeGTIN(code.slice(2, 16)) }
  }
  const expiry = ev.expiryDate && !Number.isNaN(ev.expiryDate.getTime()) ? toISODate(ev.expiryDate) : null
  return { raw: code, gtin: ev.gtin ?? null, batchNumber: ev.batchNumber?.trim() || null, expiry }
}

/** Does a scanned GTIN identify this product (by its GTIN or stored raw barcode)? */
export function scanMatchesProduct(scan: ScanFields, product: { gtin?: string | null; barcode_raw?: string | null }): boolean {
  const g = scan.gtin ? normalizeGTIN(scan.gtin) : null
  if (g && product.gtin && normalizeGTIN(product.gtin) === g) return true
  if (product.barcode_raw && product.barcode_raw === scan.raw) return true
  return false
}
