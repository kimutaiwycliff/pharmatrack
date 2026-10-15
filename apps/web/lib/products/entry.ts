// "Add product" box: the pure parts — is what was typed/scanned a barcode, and
// pack ↔ unit price conversions. UI: components/inventory/NewProductDialog.tsx.
import { parseBarcode, normalizeGTIN } from "@pharmatrack/core"

export interface ScannedCode {
  /** GTIN (or the raw code for non-GTIN barcodes) to store on the product. */
  code: string
  batchNumber?: string
  /** YYYY-MM-DD (from a GS1 DataMatrix / GS1-128 label). */
  expiryDate?: string
}

/**
 * What a USB scanner (or someone typing a barcode) put in the search box, or
 * null when it reads as a product name. GS1 labels also carry batch + expiry.
 */
export function readScannedCode(input: string): ScannedCode | null {
  const raw = input.trim()
  if (raw.length < 8 || /\s/.test(raw)) return null
  const ev = parseBarcode(raw)
  if (ev.type === "GS1_128" && ev.gtin) {
    return {
      code: normalizeGTIN(ev.gtin),
      batchNumber: ev.batchNumber,
      expiryDate: ev.expiryDate ? ymd(ev.expiryDate) : undefined,
    }
  }
  // Plain EAN/UPC/GTIN-14, or an internal all-digit code.
  if (/^\d{8,14}$/.test(raw)) return { code: normalizeGTIN(raw) }
  return null
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Price per base unit from a pack price ("" when it can't be worked out). */
export function unitPriceFromPack(packPrice: string, unitsPerPack: number): string {
  const p = Number(packPrice)
  if (!packPrice.trim() || !Number.isFinite(p) || p <= 0 || unitsPerPack < 1) return ""
  return String(Math.round((p * 100) / unitsPerPack) / 100)
}

/** Pack price from a per-unit price ("" when it can't be worked out). */
export function packPriceFromUnit(unitPrice: string, unitsPerPack: number): string {
  const u = Number(unitPrice)
  if (!unitPrice.trim() || !Number.isFinite(u) || u <= 0 || unitsPerPack < 1) return ""
  return String(Math.round(u * 100 * unitsPerPack) / 100)
}
