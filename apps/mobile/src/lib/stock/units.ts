// R3: pack ↔ base-unit maths shared by Receive stock and Receive delivery.
// Products keep stock and cost per BASE unit (tablet, ml…); people receive in
// PACKS (what's on the supplier invoice). Same conversions as web's
// StockReceiveForm and POST /api/purchase-orders/[id]/receive. Money here is
// decimal KES rounded to cents at the boundary, exactly like the server.

const round2 = (n: number) => Math.round(n * 100) / 100

/** Packs → base units (units per pack < 1 is treated as 1). */
export function packsToUnits(packs: number, unitsPerPack: number | null | undefined): number {
  return Math.round(packs) * Math.max(1, Math.round(unitsPerPack ?? 1))
}

/** Invoice cost per pack → cost per base unit, rounded to the cent (server rule). */
export function costPerUnit(costPerPack: number, unitsPerPack: number | null | undefined): number {
  return round2(costPerPack / Math.max(1, Math.round(unitsPerPack ?? 1)))
}

/** Stored cost per base unit → cost per pack, to prefill a per-pack field. */
export function costPerPack(costPerBaseUnit: number | null | undefined, unitsPerPack: number | null | undefined): number | null {
  if (costPerBaseUnit == null) return null
  return round2(costPerBaseUnit * Math.max(1, Math.round(unitsPerPack ?? 1)))
}

/** Parse a typed decimal ("12.50", "1,200") — null when blank or invalid. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/,/g, "").trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Parse a typed whole number of packs — null when blank, invalid or ≤ 0. */
export function parsePacks(text: string): number | null {
  const t = text.replace(/,/g, "").trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n > 0 ? n : null
}
