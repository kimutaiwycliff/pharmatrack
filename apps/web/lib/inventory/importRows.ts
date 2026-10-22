// Bulk import (components/inventory/BulkImportDialog.tsx): the pure parts —
// guess which of our fields a spreadsheet column is, and clean the messy
// values real pharmacy sheets contain ("KES 1,200", "03/2027", Excel dates)
// into what POST /api/inventory/import expects.

export interface ImportField { key: string; label: string; required?: boolean; hint?: string }

export const IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Name", required: true },
  { key: "generic_name", label: "Generic name", hint: "blank → from the catalogue" },
  { key: "selling_price", label: "Selling price", hint: "per unit, KES" },
  { key: "pack_selling_price", label: "Pack selling price", hint: "per pack — becomes a pack size when a unit price is also given" },
  { key: "brand_name", label: "Brand" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "gtin", label: "Barcode / GTIN" },
  { key: "barcode_raw", label: "Old item code", hint: "your previous POS code — searchable at the till" },
  { key: "strength", label: "Strength" },
  { key: "dosage_form", label: "Dosage form" },
  { key: "base_unit", label: "Base unit", hint: "tablet, ml, bottle… (default: unit)" },
  { key: "category", label: "Category", hint: "e.g. Pain & Fever — blank → suggested" },
  { key: "subcategory", label: "Subcategory", hint: "e.g. Gout" },
  { key: "pack_label", label: "Pack name", hint: "Box, Strip…" },
  { key: "units_per_pack", label: "Units per pack" },
  { key: "cost_price", label: "Cost price", hint: "per unit, KES" },
  { key: "pack_cost_price", label: "Pack cost price", hint: "per pack" },
  { key: "reorder_level", label: "Reorder level" },
  { key: "supplier", label: "Supplier", hint: "added to your suppliers if new" },
  { key: "is_controlled", label: "Controlled?", hint: "yes/no" },
  { key: "requires_prescription", label: "Requires Rx?", hint: "yes/no" },
  { key: "opening_qty", label: "Opening stock qty", hint: "needs branch + expiry" },
  { key: "batch_number", label: "Batch number" },
  { key: "expiry_date", label: "Expiry date", hint: "any common format" },
]

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim()

// Exact (normalised) header → field.
const EXACT: Record<string, string> = {
  "name": "name", "product name": "name", "product": "name", "item": "name", "item name": "name", "drug": "name",
  "drug name": "name", "description": "name", "item description": "name", "product description": "name", "medicine": "name",
  "generic name": "generic_name", "generic": "generic_name", "inn": "generic_name", "molecule": "generic_name",
  "old item code": "barcode_raw", "item code": "barcode_raw", "code": "barcode_raw", "sku": "barcode_raw", "product code": "barcode_raw",
  "smallest unit sold": "base_unit", "unit sold": "base_unit", "sold per": "base_unit",
  "supplier": "supplier", "default supplier": "supplier", "vendor": "supplier",
  "selling price per unit": "selling_price", "selling price per pack": "pack_selling_price",
  "cost price per pack": "pack_cost_price", "cost price per unit": "cost_price",
  "qty in stock": "opening_qty", "prescription only": "requires_prescription",
  "ppb reg no": "", "review note": "", "notes": "", "note": "",
  "brand": "brand_name", "brand name": "brand_name", "trade name": "brand_name",
  "manufacturer": "manufacturer", "maker": "manufacturer", "mfr": "manufacturer", "company": "manufacturer",
  "gtin": "gtin", "barcode": "gtin", "bar code": "gtin", "ean": "gtin", "upc": "gtin",
  "strength": "strength", "dose": "strength", "dosage": "strength",
  "dosage form": "dosage_form", "form": "dosage_form", "formulation": "dosage_form",
  "base unit": "base_unit", "unit": "base_unit", "uom": "base_unit", "unit of measure": "base_unit",
  "category": "category", "department": "category", "dept": "category", "group": "category",
  "subcategory": "subcategory", "sub category": "subcategory", "subcat": "subcategory", "sub department": "subcategory",
  "pack": "pack_label", "pack name": "pack_label", "pack type": "pack_label", "packaging": "pack_label",
  "units per pack": "units_per_pack", "pack size": "units_per_pack", "pack qty": "units_per_pack", "qty per pack": "units_per_pack",
  "cost price": "cost_price", "cost": "cost_price", "buying price": "cost_price", "buy price": "cost_price", "unit cost": "cost_price",
  "selling price": "selling_price", "price": "selling_price", "sell price": "selling_price", "retail price": "selling_price",
  "retail": "selling_price", "unit price": "selling_price", "sp": "selling_price", "rrp": "selling_price",
  "reorder level": "reorder_level", "reorder": "reorder_level", "min stock": "reorder_level", "minimum stock": "reorder_level",
  "controlled": "is_controlled", "is controlled": "is_controlled", "narcotic": "is_controlled",
  "prescription": "requires_prescription", "requires prescription": "requires_prescription", "rx": "requires_prescription", "pom": "requires_prescription",
  "opening qty": "opening_qty", "opening stock": "opening_qty", "quantity": "opening_qty", "qty": "opening_qty",
  "stock": "opening_qty", "qty on hand": "opening_qty", "quantity on hand": "opening_qty", "soh": "opening_qty", "balance": "opening_qty",
  "batch number": "batch_number", "batch": "batch_number", "batch no": "batch_number", "lot": "batch_number", "lot no": "batch_number",
  "expiry date": "expiry_date", "expiry": "expiry_date", "exp date": "expiry_date", "exp": "expiry_date", "expiration": "expiry_date",
  "expires": "expiry_date", "best before": "expiry_date",
}

/** Which of our fields a spreadsheet column most likely is ("" = no idea). */
export function guessField(header: string): string {
  const h = norm(header)
  if (!h) return ""
  if (h in EXACT) return EXACT[h]!
  const has = (...w: string[]) => w.some((x) => new RegExp(`\\b${x}`).test(h))
  const pack = has("pack", "box", "carton", "strip")
  if (has("expir", "exp")) return "expiry_date"
  if (has("batch", "lot")) return "batch_number"
  if (has("barcode", "gtin", "ean")) return "gtin"
  if (has("cost", "buying", "purchase")) return pack ? "pack_cost_price" : "cost_price"
  if (has("price", "selling", "retail", "rrp")) return pack ? "pack_selling_price" : "selling_price"
  if (has("reorder", "minimum", "min")) return "reorder_level"
  if (pack && has("size", "units", "per")) return "units_per_pack"
  if (has("qty", "quantity", "stock", "balance", "on hand")) return "opening_qty"
  if (has("supplier", "vendor")) return "supplier"
  if (has("manufactur")) return "manufacturer"
  if (has("brand")) return "brand_name"
  if (has("strength")) return "strength"
  if (has("form")) return "dosage_form"
  if (has("sub")) return "subcategory"
  if (has("categor", "department", "class")) return "category"
  if (has("controlled", "narcotic")) return "is_controlled"
  if (has("prescription", "rx")) return "requires_prescription"
  if (has("name", "item", "product", "description", "drug")) return "name"
  return ""
}

/** One column per field: the first header that guesses to each field wins. */
export function autoMapping(headers: string[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const h of headers) {
    const f = guessField(h)
    if (f && !m[f]) m[f] = h
  }
  // A sheet whose only name column is "Generic name" names products by it.
  if (!m.name && m.generic_name) { m.name = m.generic_name; delete m.generic_name }
  return m
}

/** "KES 1,200.50" → "1200.5"; "" when there's no number. */
export function cleanNumber(v: unknown): string {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : ""
  const s = String(v ?? "").replace(/kes|ksh?s?\.?|\/=|,|\s/gi, "")
  const m = s.match(/-?\d+(?:\.\d+)?/)
  return m ? String(Number(m[0])) : ""
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const pad = (n: number) => String(n).padStart(2, "0")
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)
function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > lastDay(y, m) || y < 2000 || y > 2100) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * Expiry in whatever shape the sheet has → YYYY-MM-DD, or null. Day-first
 * (Kenyan) for 03/04/2027. Month-only expiries ("03/2027", "Mar-27") mean the
 * end of that month, as printed on packs.
 */
export function cleanDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : ymd(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === "number") {
    // Excel serial day (1900 system): 45000 ≈ 2023.
    if (v > 30000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000)
      return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }
    return null
  }
  const s = String(v ?? "").trim().toLowerCase()
  if (!s) return null
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return ymd(+m[1]!, +m[2]!, +m[3]!)
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return ymd(fullYear(+m[3]!), +m[2]!, +m[1]!)
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})$/))) return ymd(+m[1]!, +m[2]!, lastDay(+m[1]!, +m[2]!))
  if ((m = s.match(/^(\d{1,2})[-/.](\d{2,4})$/))) {
    const y = fullYear(+m[2]!)
    return ymd(y, +m[1]!, lastDay(y, +m[1]!))
  }
  if ((m = s.match(/^(?:(\d{1,2})[\s-]+)?([a-z]{3})[a-z]*\.?[\s,-]*(\d{2,4})$/))) {
    const mon = MONTHS.indexOf(m[2]!) + 1
    if (!mon) return null
    const y = fullYear(+m[3]!)
    return ymd(y, mon, m[1] ? +m[1] : lastDay(y, mon))
  }
  if (/^\d+(\.\d+)?$/.test(s)) return cleanDate(Number(s))
  return null
}

const cellText = (v: unknown) => (v instanceof Date ? cleanDate(v) ?? "" : String(v ?? "").trim())

const NUMERIC = new Set(["selling_price", "cost_price", "pack_selling_price", "pack_cost_price", "units_per_pack", "reorder_level", "opening_qty"])

/**
 * Spreadsheet rows → the objects the import API takes, using `mapping`
 * (field → header). Pack prices become per-unit prices; numbers and dates
 * are cleaned. `problems` holds what would make a row fail.
 */
export function toImportRows(
  headers: string[],
  rows: unknown[][],
  mapping: Record<string, string>,
  opts: { hasBranch: boolean },
): Array<{ data: Record<string, string>; problems: string[]; warnings: string[] }> {
  const idx: Record<string, number> = {}
  for (const [field, header] of Object.entries(mapping)) {
    const i = header ? headers.indexOf(header) : -1
    if (i >= 0) idx[field] = i
  }

  return rows
    .filter((cols) => cols.some((c) => cellText(c) !== ""))
    .map((cols) => {
      const data: Record<string, string> = {}
      const problems: string[] = []
      for (const [f, i] of Object.entries(idx)) {
        const v = cols[i]
        if (NUMERIC.has(f)) {
          const n = cleanNumber(v)
          if (n) data[f] = n
        } else if (f === "expiry_date") {
          const raw = cellText(v)
          if (raw) {
            const d = cleanDate(v)
            if (d) data.expiry_date = d
            else problems.push(`can't read expiry "${raw}"`)
          }
        } else {
          const t = cellText(v)
          if (t) data[f] = t
        }
      }
      const units = Number(data.units_per_pack) >= 1 ? Math.round(Number(data.units_per_pack)) : 1
      // Pack price only → the unit price. Both given → the pack keeps its own
      // price (the server adds it as a pack size).
      if (!data.selling_price && data.pack_selling_price) {
        data.selling_price = String(Math.round((Number(data.pack_selling_price) * 100) / units) / 100)
        delete data.pack_selling_price
      }
      if (data.pack_selling_price && units <= 1) delete data.pack_selling_price
      if (!data.cost_price && data.pack_cost_price) data.cost_price = String(Math.round((Number(data.pack_cost_price) * 100) / units) / 100)
      delete data.pack_cost_price
      if (data.units_per_pack) data.units_per_pack = String(units)
      if (data.opening_qty) data.opening_qty = String(Math.max(0, Math.round(Number(data.opening_qty))))

      if (!data.name) problems.push("missing name")
      if (!(Number(data.selling_price) > 0)) problems.push("no selling price")
      // The product is still created; only its opening stock waits.
      const warnings: string[] = []
      if (Number(data.opening_qty) > 0) {
        if (!opts.hasBranch) warnings.push("stock skipped — no branch selected")
        else if (!data.expiry_date) warnings.push("stock skipped — no expiry date")
      }
      const unitCost = Number(data.cost_price)
      if (unitCost > 0 && Number(data.selling_price) > 0 && unitCost >= Number(data.selling_price)) warnings.push("cost is not below the selling price")
      // Usually a pack price typed into the per-unit column.
      else if (unitCost > 0 && Number(data.selling_price) > unitCost * 5) warnings.push(`price is over 5× the unit cost (${unitCost}) — is it per unit?`)
      return { data, problems, warnings }
    })
}
