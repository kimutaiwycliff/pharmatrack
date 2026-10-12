// Pure pack-size and "Sell in smaller units" maths.
//  - Pack sizes mirror apps/web/app/api/products/[id]/pack-sizes/route.ts's
//    schema: label required, units_per_pack a positive integer, selling_price
//    positive, barcode optional (the server generates one when blank).
//  - Split-unit mirrors web EditProductSheet's SplitUnitPanel and the
//    /split-unit route: factor is a whole number 2–1000, the new unit name is
//    1–40 characters and must differ from the current one; the per-unit price
//    becomes round2(price / factor), exactly as the server's div() does it.

export interface PackSizeValues {
  pack_label: string
  units_per_pack: string
  selling_price: string
  barcode: string
}

export type PackSizeErrors = Partial<Record<keyof PackSizeValues, string>>

export interface PackSizeBody {
  pack_label: string
  units_per_pack: number
  selling_price: number
  barcode: string | null
}

export const EMPTY_PACK_SIZE: PackSizeValues = { pack_label: "", units_per_pack: "", selling_price: "", barcode: "" }

export function packSizeValues(p: { pack_label: string; units_per_pack: number; selling_price: number; barcode: string | null }): PackSizeValues {
  return { pack_label: p.pack_label, units_per_pack: String(p.units_per_pack), selling_price: String(p.selling_price), barcode: p.barcode ?? "" }
}

export function validatePackSize(v: PackSizeValues, baseUnit: string): { ok: true; body: PackSizeBody } | { ok: false; errors: PackSizeErrors } {
  const errors: PackSizeErrors = {}
  const label = v.pack_label.trim()
  if (!label) errors.pack_label = "Give the pack a name, e.g. Strip of 10"

  const unitsText = v.units_per_pack.replace(/,/g, "").trim()
  const units = /^\d+$/.test(unitsText) ? Number(unitsText) : NaN
  if (!(units >= 1)) errors.units_per_pack = `How many ${plural(baseUnit || "unit")} are in this pack (1 or more)`

  const priceText = v.selling_price.replace(/,/g, "").trim()
  const price = /^\d+(\.\d+)?$/.test(priceText) ? Number(priceText) : NaN
  if (!(price > 0)) errors.selling_price = "Enter a selling price above 0"

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, body: { pack_label: label, units_per_pack: units, selling_price: price, barcode: v.barcode.trim() || null } }
}

/** "tablet" → "tablets"; leaves already-plural / unit-symbol words alone. */
export function plural(unit: string): string {
  const u = unit.trim()
  if (!u || /s$/i.test(u) || /^(ml|g|mg|kg|l)$/i.test(u)) return u
  return `${u}s`
}

// ── Sell in smaller units ────────────────────────────────────────────────────

export interface SplitValues {
  factor: string
  unit: string
}

export type SplitErrors = Partial<Record<keyof SplitValues, string>>

export interface SplitPreview {
  factor: number
  unit: string
  /** New selling price per new unit, integer cents. */
  newPriceCents: number
  /** True when price / factor didn't divide to a whole cent. */
  rounded: boolean
}

export function validateSplit(
  v: SplitValues,
  product: { base_unit: string; selling_price: number | string },
): { ok: true; preview: SplitPreview } | { ok: false; errors: SplitErrors } {
  const errors: SplitErrors = {}
  const unit = v.unit.trim()
  const factorText = v.factor.trim()
  const factor = /^\d+$/.test(factorText) ? Number(factorText) : NaN

  if (!(factor >= 2 && factor <= 1000)) errors.factor = `A whole number from 2 to 1000 — how many new units make one ${product.base_unit}`
  if (!unit) errors.unit = "Name the smaller unit, e.g. capsule"
  else if (unit.length > 40) errors.unit = "Keep the unit name under 40 characters"
  else if (unit.toLowerCase() === product.base_unit.trim().toLowerCase()) errors.unit = "Pick a different, smaller unit"

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const price = Number(product.selling_price)
  const newPriceCents = Math.round((price / factor) * 100)
  const exactCents = Math.round(price * 100)
  return { ok: true, preview: { factor, unit, newPriceCents, rounded: exactCents % factor !== 0 } }
}
