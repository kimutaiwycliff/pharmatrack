// Shared CSV plumbing for the inventory bulk-import feature (web + mobile) and
// the reports CSV export feature. Extracted from what was previously a
// web-only copy in components/inventory/BulkImportDialog.tsx so mobile can
// reuse the exact same parser instead of a second, potentially-drifting one.

/** Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes, CRLF. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false
  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field); field = ""
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = ""
    } else if (c === "\r") {
      // ignore; handled by \n
    } else field += c
  }
  // flush last field/row
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

/** Turns parsed CSV rows (first row = header) into header-keyed records, the
 *  shape POST /api/inventory/import expects for its `rows` array. */
export function csvRowsToRecords(rows: string[][]): Record<string, string>[] {
  const header = rows[0]
  if (!header) return []
  return rows.slice(1).map((row) => Object.fromEntries(header.map((h, i) => [h.trim(), (row[i] ?? "").trim()])))
}

/** Canonical column order for the inventory bulk-import template — matches
 *  apps/web/app/api/inventory/import/route.ts's rowSchema field names exactly. */
export const INVENTORY_IMPORT_HEADERS = [
  "name", "brand_name", "manufacturer", "gtin", "strength", "dosage_form",
  "base_unit", "category", "subcategory", "units_per_pack", "cost_price", "selling_price", "reorder_level",
  "is_controlled", "requires_prescription", "opening_qty", "batch_number", "expiry_date",
] as const

export const INVENTORY_IMPORT_EXAMPLE_ROW = [
  "Paracetamol", "Panadol", "GSK", "", "500mg", "Tablet",
  "tablet", "OTC Medicines", "Pain & Fever", "1000", "1.50", "3.00", "100",
  "no", "no", "500", "B-2026-01", "2027-06-30",
] as const

/** Serializes an array of objects (e.g. a report table) to a downloadable CSV
 *  string — the inverse direction from parseCSV, used by report exports. */
export function toCSV(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const escape = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n")
}
