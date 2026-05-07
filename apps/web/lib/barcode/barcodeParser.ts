// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GS1Reader } = require("gs1js") as { GS1Reader: new (code: string) => {
  lookup: Record<string, { value: string }>
  hasidentifiers: boolean
} }

export interface BarcodeScanEvent {
  raw: string
  type: "EAN13" | "EAN8" | "CODE128" | "CODE39" | "GS1_128" | "DATAMATRIX" | "QR" | "UNKNOWN"
  gtin?: string
  batchNumber?: string
  expiryDate?: Date
  serialNumber?: string
}

// FNC1 character (Group Separator, ASCII 29) indicates GS1 encoding
const FNC1 = "\x1D"
// Symbology identifiers for GS1
const GS1_PREFIXES = ["]d2", "]C1", "]e0"]

export function isGS1(raw: string): boolean {
  if (raw.includes(FNC1)) return true
  if (GS1_PREFIXES.some((p) => raw.startsWith(p))) return true
  // GS1-128 often detected by leading ] symbology identifier
  return false
}

export function normalizeGTIN(gtin: string): string {
  // GTIN-14 with leading zero → GTIN-13
  if (gtin.length === 14 && gtin.startsWith("0")) return gtin.slice(1)
  return gtin
}

function parseExpiryYYMMDD(raw: string): Date {
  const yy = raw.slice(0, 2)
  const mm = raw.slice(2, 4)
  const dd = raw.slice(4, 6)

  const year = parseInt(yy, 10) + 2000
  const month = parseInt(mm, 10) // 1-based
  const day = parseInt(dd, 10)

  if (day === 0) {
    // Day 00 means last day of the month
    return new Date(year, month, 0) // day 0 of next month = last day of this month
  }
  return new Date(year, month - 1, day)
}

export function parseGS1(raw: string): Partial<BarcodeScanEvent> {
  // Strip symbology identifiers before passing to gs1js
  let code = raw
  for (const prefix of GS1_PREFIXES) {
    if (code.startsWith(prefix)) {
      code = code.slice(prefix.length)
      break
    }
  }

  try {
    const reader = new GS1Reader(code)
    const result: Partial<BarcodeScanEvent> = {}

    // AI (01) = GTIN-14
    const gtinAI = reader.lookup["01"]
    if (gtinAI) {
      result.gtin = normalizeGTIN(gtinAI.value as string)
    }

    // AI (17) = Expiry date YYMMDD
    const expiryAI = reader.lookup["17"]
    if (expiryAI) {
      result.expiryDate = parseExpiryYYMMDD(expiryAI.value as string)
    }

    // AI (10) = Batch/Lot number
    const batchAI = reader.lookup["10"]
    if (batchAI) {
      result.batchNumber = batchAI.value as string
    }

    // AI (21) = Serial number
    const serialAI = reader.lookup["21"]
    if (serialAI) {
      result.serialNumber = serialAI.value as string
    }

    return result
  } catch {
    return {}
  }
}

export function detectBarcodeType(raw: string): BarcodeScanEvent["type"] {
  if (isGS1(raw)) return "GS1_128"

  const digits = raw.replace(/\D/g, "")
  if (digits.length === 13 && digits === raw) return "EAN13"
  if (digits.length === 8 && digits === raw) return "EAN8"

  // CODE39 uses uppercase letters, digits, and a few symbols
  if (/^[A-Z0-9 $%+\-.\/]+$/.test(raw)) return "CODE39"

  // CODE128 can contain any ASCII character
  if (raw.length > 0) return "CODE128"

  return "UNKNOWN"
}

export function parseBarcode(raw: string): BarcodeScanEvent {
  const type = detectBarcodeType(raw)

  if (type === "GS1_128") {
    const gs1Data = parseGS1(raw)
    return { raw, type, ...gs1Data }
  }

  if (type === "EAN13") {
    return { raw, type, gtin: raw }
  }

  if (type === "EAN8") {
    return { raw, type, gtin: raw }
  }

  return { raw, type }
}
