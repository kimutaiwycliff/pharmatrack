// Products → Export to Excel: the same columns, in the same order, as the
// import template (scripts/gen_import_template.py), so an export can be
// imported straight back — e.g. as a count sheet for a new branch: export,
// fill in Qty / Batch / Expiry, switch branch, import. Prices go out the way
// the template asks for them: cost per PACK, selling price per UNIT.

export const EXPORT_HEADERS = [
  "Product name *", "Generic name (INN)", "Strength", "Dosage form", "Barcode (GTIN)", "Old item code", "Category", "Subcategory",
  "Smallest unit sold *", "Pack name", "Units per pack *", "Cost price per PACK (KES) *", "Selling price per UNIT (KES) *",
  "Selling price per PACK (KES)", "Qty in stock (UNITS)", "Batch number", "Expiry date", "Reorder level (UNITS)",
  "Prescription only? (Y/N)", "Controlled? (Y/N)", "Supplier",
] as const

/** Column widths (characters) for the sheet, in EXPORT_HEADERS order. */
export const EXPORT_WIDTHS = [42, 26, 12, 13, 16, 13, 24, 26, 14, 11, 10, 14, 14, 14, 11, 13, 12, 11, 11, 11, 18]

/** One product as GET /api/products/export returns it. */
export interface ExportProduct {
  name: string
  generic_name: string | null
  strength: string | null
  dosage_form: string | null
  gtin: string | null
  barcode_raw: string | null
  category: string | null
  subcategory: string | null
  base_unit: string
  pack_label: string | null
  units_per_pack: number
  /** Per unit; null when unknown or when the person can't see costs. */
  cost_price: number | null
  selling_price: number
  /** A full pack's own price (an active pack size of `units_per_pack`), if any. */
  pack_selling_price: number | null
  reorder_level: number
  requires_prescription: boolean
  is_controlled: boolean
  supplier: string | null
  /** Stock exports only: the branch's batches with stock left. */
  batches?: Array<{ batch_number: string; expiry_date: string; quantity: number }>
}

export type ExportCell = string | number | null

const money = (n: number) => Math.round(n * 100) / 100
const yn = (b: boolean) => (b ? "Y" : "N")

/** Products → sheet rows (no header). Stock exports give one row per batch. */
export function toExportRows(products: ExportProduct[], opts: { withStock: boolean }): ExportCell[][] {
  const rows: ExportCell[][] = []
  for (const p of products) {
    const units = p.units_per_pack > 0 ? p.units_per_pack : 1
    const base: ExportCell[] = [
      p.name, p.generic_name, p.strength, p.dosage_form, p.gtin, p.barcode_raw, p.category, p.subcategory,
      p.base_unit, p.pack_label, units, p.cost_price == null ? null : money(p.cost_price * units), money(p.selling_price),
      p.pack_selling_price == null ? null : money(p.pack_selling_price),
    ]
    const tail: ExportCell[] = [p.reorder_level, yn(p.requires_prescription), yn(p.is_controlled), p.supplier]
    const batches = opts.withStock ? (p.batches ?? []) : []
    if (batches.length === 0) rows.push([...base, null, null, null, ...tail])
    else for (const b of batches) rows.push([...base, b.quantity, b.batch_number, b.expiry_date, ...tail])
  }
  return rows
}

/** "Afya Bora — products 2026-10-23.xlsx" (safe for every OS). */
export function exportFileName(org: string, kind: "products" | "stock", date: string, branch?: string | null): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
  return `${clean(org)} — ${kind === "stock" ? `stock at ${clean(branch ?? "branch")}` : "products"} ${date}.xlsx`
}
