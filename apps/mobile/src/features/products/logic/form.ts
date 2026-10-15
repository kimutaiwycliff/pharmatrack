import { toCents } from "@pharmatrack/core"

// Pure product-form logic shared by /products/new and /products/[id]/edit.
// Validation mirrors web's NewProductDialog zod schema (name, dosage form,
// base unit, selling price, max discount) plus the server's own rules in
// apps/web/app/api/products/route.ts (create) and [id]/route.ts (update):
// units_per_pack int ≥ 1, reorder_level int ≥ 0, cost ≥ 0, discount 0–100.

export const DOSAGE_FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Cream", "Gel", "Ointment", "Lotion", "Injection", "Drops", "Inhaler", "Sachet"]
export const BASE_UNITS = ["tablet", "capsule", "ml", "g", "unit", "bottle", "tube", "sachet", "pack", "vial", "inhaler", "piece"]

export interface ProductFormValues {
  name: string
  brand_name: string
  generic_name: string
  manufacturer: string
  gtin: string
  barcode_raw: string
  strength: string
  dosage_form: string
  category_id: string | null
  supplier_id: string | null
  base_unit: string
  pack_label: string
  units_per_pack: string
  cost_price: string
  selling_price: string
  reorder_level: string
  max_discount_percent: string
  is_controlled: boolean
  requires_prescription: boolean
  is_active: boolean
  image_url: string | null
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>

export function emptyProductForm(prefill?: { gtin?: string | null; name?: string | null; supplier_id?: string | null }): ProductFormValues {
  return {
    name: prefill?.name ?? "",
    brand_name: "",
    generic_name: "",
    manufacturer: "",
    gtin: prefill?.gtin ?? "",
    barcode_raw: "",
    strength: "",
    dosage_form: "",
    category_id: null,
    supplier_id: prefill?.supplier_id ?? null,
    // Web's NewProductDialog starts on "tablet" too.
    base_unit: "tablet",
    pack_label: "",
    units_per_pack: "1",
    cost_price: "",
    selling_price: "",
    reorder_level: "10",
    max_discount_percent: "",
    is_controlled: false,
    requires_prescription: false,
    is_active: true,
    image_url: null,
  }
}

interface ProductLike {
  name: string
  brand_name: string | null
  generic_name: string | null
  manufacturer: string | null
  gtin: string | null
  barcode_raw: string | null
  strength: string | null
  dosage_form: string | null
  category_id: string | null
  supplier_id: string | null
  base_unit: string
  pack_label: string | null
  units_per_pack: number
  cost_price?: number | string | null
  selling_price: number | string
  reorder_level: number
  max_discount_percent: number | string | null
  is_controlled: boolean
  requires_prescription: boolean
  is_active: boolean
  image_url: string | null
}

export function formFromProduct(p: ProductLike): ProductFormValues {
  return {
    name: p.name,
    brand_name: p.brand_name ?? "",
    generic_name: p.generic_name ?? "",
    manufacturer: p.manufacturer ?? "",
    gtin: p.gtin ?? "",
    barcode_raw: p.barcode_raw ?? "",
    strength: p.strength ?? "",
    dosage_form: p.dosage_form ?? "",
    category_id: p.category_id,
    supplier_id: p.supplier_id,
    base_unit: p.base_unit,
    pack_label: p.pack_label ?? "",
    units_per_pack: String(p.units_per_pack),
    cost_price: p.cost_price != null ? String(p.cost_price) : "",
    selling_price: String(p.selling_price),
    reorder_level: String(p.reorder_level),
    max_discount_percent: p.max_discount_percent != null ? String(p.max_discount_percent) : "",
    is_controlled: p.is_controlled,
    requires_prescription: p.requires_prescription,
    is_active: p.is_active,
    image_url: p.image_url,
  }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const INVALID = Symbol("invalid")
type Parsed = number | null | typeof INVALID

/** Decimal like "12.50" / "1,200" → number; blank → null; anything else → INVALID. */
function parseDecimal(text: string): Parsed {
  const t = text.replace(/,/g, "").trim()
  if (!t) return null
  if (!/^\d+(\.\d+)?$/.test(t)) return INVALID
  return Number(t)
}

/** Whole number like "10" → number; blank → null; anything else → INVALID. */
function parseWhole(text: string): Parsed {
  const t = text.replace(/,/g, "").trim()
  if (!t) return null
  if (!/^\d+$/.test(t)) return INVALID
  return Number(t)
}

/** Decimal KES (string or number) → integer cents; null when blank/invalid. */
export function priceCents(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null
  try {
    return toCents(v)
  } catch {
    return null
  }
}

// ── Validation + request bodies ──────────────────────────────────────────────

/** Body for POST /api/products, PATCH /api/products/[id] and the local repo.
 *  Money is decimal KES (the API's contract), parsed from one typed field —
 *  never summed. */
export interface ProductBody {
  name: string
  brand_name?: string | null
  generic_name?: string | null
  manufacturer?: string | null
  gtin?: string | null
  barcode_raw?: string | null
  strength?: string | null
  dosage_form?: string | null
  category_id?: string | null
  supplier_id?: string | null
  base_unit: string
  pack_label?: string | null
  units_per_pack?: number
  cost_price?: number | null
  selling_price: number
  reorder_level?: number
  max_discount_percent?: number | null
  is_controlled: boolean
  requires_prescription: boolean
  is_active?: boolean
  image_url?: string | null
}

export type ProductFormMode = "create" | "edit"

export type ProductFormResult = { ok: true; body: ProductBody } | { ok: false; errors: ProductFormErrors }

export function validateProductForm(
  v: ProductFormValues,
  opts: { mode: ProductFormMode; costVisible: boolean },
): ProductFormResult {
  const errors: ProductFormErrors = {}
  const name = v.name.trim()
  const baseUnit = v.base_unit.trim()
  const dosageForm = v.dosage_form.trim()

  if (!name) errors.name = "Generic name is required"
  // Web only insists on a dosage form when creating (NewProductDialog);
  // EditProductSheet lets an older product without one be saved.
  if (opts.mode === "create" && !dosageForm) errors.dosage_form = "Dosage form is required"
  if (!baseUnit) errors.base_unit = "Base unit is required"

  const selling = parseDecimal(v.selling_price)
  if (selling === null || selling === INVALID || selling <= 0) errors.selling_price = "Enter a selling price above 0"

  const cost = opts.costVisible ? parseDecimal(v.cost_price) : null
  if (cost === INVALID) errors.cost_price = "Enter a valid cost (0 or more), or leave it blank"

  const units = parseWhole(v.units_per_pack)
  if (units === INVALID || (typeof units === "number" && units < 1)) errors.units_per_pack = "Use a whole number, 1 or more"

  const reorder = parseWhole(v.reorder_level)
  if (reorder === INVALID) errors.reorder_level = "Use a whole number, 0 or more"

  const discount = parseDecimal(v.max_discount_percent)
  if (discount === INVALID || (typeof discount === "number" && discount > 100)) {
    errors.max_discount_percent = "Between 0 and 100, or leave blank for no limit"
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const text = (s: string) => s.trim() || null
  const body: ProductBody = {
    name,
    brand_name: text(v.brand_name),
    manufacturer: text(v.manufacturer),
    gtin: text(v.gtin),
    barcode_raw: text(v.barcode_raw),
    strength: text(v.strength),
    dosage_form: dosageForm || null,
    category_id: v.category_id,
    supplier_id: v.supplier_id,
    base_unit: baseUnit,
    pack_label: text(v.pack_label),
    units_per_pack: typeof units === "number" ? units : 1,
    selling_price: selling as number,
    reorder_level: typeof reorder === "number" ? reorder : 10,
    max_discount_percent: typeof discount === "number" ? discount : null,
    is_controlled: v.is_controlled,
    requires_prescription: v.requires_prescription,
    image_url: v.image_url,
  }
  if (opts.costVisible) body.cost_price = typeof cost === "number" ? cost : null

  if (opts.mode === "create") {
    // The create schema's optional strings aren't nullable — leave blanks out
    // (the server derives generic_name from the name when it's missing and
    // generates an internal barcode when neither GTIN nor raw barcode is set).
    const out: ProductBody = { ...body, generic_name: text(v.generic_name) }
    for (const k of ["brand_name", "generic_name", "manufacturer", "gtin", "barcode_raw", "strength", "dosage_form", "category_id", "pack_label", "image_url"] as const) {
      if (out[k] == null) delete out[k]
    }
    if (out.cost_price == null) delete out.cost_price
    return { ok: true, body: out }
  }
  // Edit: send everything (nulls clear a field). generic_name isn't in the
  // PATCH schema — zod strips it online — but the Offline Edition's
  // updateLocalProduct() writes every column, so carry it through unchanged.
  return { ok: true, body: { ...body, generic_name: text(v.generic_name), is_active: v.is_active } }
}

// ── Suggestions / autofill ───────────────────────────────────────────────────

/** Sensible base unit for a dosage form (applied until the user edits the unit). */
export function defaultBaseUnit(dosageForm: string): string {
  switch (dosageForm.trim().toLowerCase()) {
    case "tablet":
      return "tablet"
    case "capsule":
      return "capsule"
    case "syrup":
    case "suspension":
    case "drops":
    case "lotion":
      return "ml"
    case "cream":
    case "gel":
    case "ointment":
      return "g"
    case "injection":
      return "vial"
    case "sachet":
      return "sachet"
    default:
      return "unit"
  }
}

/** Curated defaults + whatever this org already uses, de-duplicated case-insensitively. */
export function mergeSuggestions(defaults: string[], used: string[] | undefined): string[] {
  const seen = new Set(defaults.map((s) => s.toLowerCase()))
  const extra: string[] = []
  for (const s of used ?? []) {
    const k = s.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      extra.push(s)
    }
  }
  return [...defaults, ...extra]
}

/** Suggestions matching what's typed (all of them when blank), minus an exact match. */
export function filterSuggestions(all: string[], typed: string, limit = 8): string[] {
  const t = typed.trim().toLowerCase()
  return all.filter((s) => s.toLowerCase() !== t && (!t || s.toLowerCase().includes(t))).slice(0, limit)
}

export function applyCatalogItem(
  v: ProductFormValues,
  item: {
    name: string; brand_name: string | null; manufacturer: string | null; gtin: string | null; strength: string | null
    dosage_form: string | null; base_unit: string; is_controlled: boolean; requires_prescription: boolean
    generic_name?: string | null; pack_label?: string | null; units_per_pack?: number | null; reference_price?: number | null
  },
): ProductFormValues {
  return {
    ...v,
    name: item.name,
    brand_name: item.brand_name ?? "",
    generic_name: item.generic_name ?? v.generic_name,
    manufacturer: item.manufacturer ?? "",
    pack_label: item.pack_label ?? v.pack_label,
    units_per_pack: item.units_per_pack && item.units_per_pack > 1 ? String(item.units_per_pack) : v.units_per_pack,
    // A starting price only (curated rows) — never overwrite one already typed.
    selling_price: v.selling_price || (item.reference_price ? String(item.reference_price) : ""),
    // Keep a scanned GTIN if the catalogue row has none.
    gtin: item.gtin ?? v.gtin,
    strength: item.strength ?? "",
    dosage_form: item.dosage_form ?? "",
    base_unit: item.base_unit || "unit",
    is_controlled: item.is_controlled,
    requires_prescription: item.requires_prescription,
  }
}

/** Gross margin % (one decimal) from typed cost and price, or null. */
export function marginPercent(costText: string, priceText: string): number | null {
  const c = priceCents(costText.replace(/,/g, "").trim())
  const p = priceCents(priceText.replace(/,/g, "").trim())
  if (c == null || p == null || c <= 0 || p <= 0) return null
  return Math.round(((p - c) / p) * 1000) / 10
}

/** "Parent › Child" for a sub-category (the server enforces two levels). */
export function categoryLabel(cat: { name: string; parent_id: string | null }, all: { id: string; name: string }[]): string {
  if (!cat.parent_id) return cat.name
  const parent = all.find((c) => c.id === cat.parent_id)
  return parent ? `${parent.name} › ${cat.name}` : cat.name
}

/** Parents first, each followed by its children — the order the picker lists them in. */
export function orderCategories<T extends { id: string; name: string; parent_id: string | null }>(all: T[]): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name)
  const ids = new Set(all.map((c) => c.id))
  const roots = all.filter((c) => !c.parent_id || !ids.has(c.parent_id)).sort(byName)
  const out: T[] = []
  for (const r of roots) {
    out.push(r)
    out.push(...all.filter((c) => c.parent_id === r.id).sort(byName))
  }
  return out
}

/** "500mg · Tablet · Panadol" line under a product name. */
export function productSubtitle(p: { strength: string | null; dosage_form: string | null; brand_name: string | null }): string {
  return [p.strength, p.dosage_form, p.brand_name].filter((s): s is string => !!s && s.trim().length > 0).join(" · ")
}

/** A 409 from POST /api/products carries `existing_product_id` — pull it out safely. */
export function existingProductId(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("existing_product_id" in body)) return null
  const id = (body as { existing_product_id: unknown }).existing_product_id
  return typeof id === "string" && id ? id : null
}

/**
 * Whether the cost field is shown/sent. Needs cost.view; when editing, the
 * server must also have sent the key (omitCost() strips it entirely otherwise),
 * so a stale local capability never blanks a cost the server hid.
 */
export function costFieldVisible(args: { canViewCost: boolean; mode: ProductFormMode; product?: { cost_price?: unknown } | null }): boolean {
  if (!args.canViewCost) return false
  if (args.mode === "create") return true
  return !!args.product && Object.prototype.hasOwnProperty.call(args.product, "cost_price")
}

/** Price per base unit from a pack price ("" when it can't be worked out). Web: lib/products/entry.ts. */
export function unitPriceFromPack(packPrice: string, unitsPerPack: number): string {
  const p = Number(packPrice.replace(/,/g, ""))
  if (!packPrice.trim() || !Number.isFinite(p) || p <= 0 || !(unitsPerPack >= 1)) return ""
  return String(Math.round((p * 100) / unitsPerPack) / 100)
}

/** Pack price from a per-unit price ("" when it can't be worked out). */
export function packPriceFromUnit(unitPrice: string, unitsPerPack: number): string {
  const u = Number(unitPrice.replace(/,/g, ""))
  if (!unitPrice.trim() || !Number.isFinite(u) || u <= 0 || !(unitsPerPack >= 1)) return ""
  return String(Math.round(u * 100 * unitsPerPack) / 100)
}

/**
 * Did a scanner (Bluetooth/USB wedge typing into the box, or the camera) give
 * us a barcode rather than a product name? 8–14 digits, or a GS1 string.
 */
export function looksLikeBarcode(input: string): boolean {
  const t = input.trim()
  return /^\d{8,14}$/.test(t) || /^(\]d2|\]C1)?01\d{14}/.test(t) || t.includes("\x1D")
}
