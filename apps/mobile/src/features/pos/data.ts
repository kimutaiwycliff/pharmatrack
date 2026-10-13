import { and, asc, eq, inArray, like, or, type SQL } from "drizzle-orm"
import { db, sqlite } from "../../db/database"
import { productPackSizes, products, type ProductRow } from "../../db/schema"
import { env } from "../../lib/env"
import type { CartSellUnit } from "./logic/cart"
import { createSaleCache, recentSalesCached } from "./logic/saleCache"
import { topSellers, type SaleLike } from "./logic/topSellers"

// Local-only reads behind the POS (SQLite catalogue cache in the online build,
// the source of truth in the Offline Edition). Nothing here touches the
// network, so search, scanning and quick-add work with no connection.

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE
const RESULT_LIMIT = 60

// The online build only sells active catalogue rows (as before R2); the
// Offline Edition lists everything, as its POS always has.
const sellableWhere = (extra?: SQL) => (OFFLINE_EDITION ? extra : extra ? and(eq(products.isActive, true), extra) : eq(products.isActive, true))

// SQLite LIKE is case-insensitive for ASCII, which is all drug names need.
const contains = (term: string) => `%${term}%`

/**
 * Every whitespace-separated term must match one of name / brand / generic /
 * strength ("amox 500" finds Amoxicillin 500mg), or the whole query must be an
 * exact GTIN / barcode / pack-size barcode.
 */
export async function searchPosProducts(query: string): Promise<ProductRow[]> {
  const q = query.trim()
  if (!q) return db.select().from(products).where(sellableWhere()).orderBy(asc(products.name)).limit(RESULT_LIMIT)
  const terms = q.split(/\s+/).slice(0, 5)
  const textMatch = and(
    ...terms.map((t) => {
      const p = contains(t)
      return or(like(products.name, p), like(products.brandName, p), like(products.genericName, p), like(products.strength, p))
    }),
  )
  // Pack-size barcodes as a subquery — one SQLite round trip per keystroke, not two.
  const packIds = db
    .select({ id: productPackSizes.productId })
    .from(productPackSizes)
    .where(and(eq(productPackSizes.barcode, q), eq(productPackSizes.isActive, true)))
  const codeMatch = or(eq(products.gtin, q), eq(products.barcodeRaw, q), inArray(products.productId, packIds))
  return db
    .select()
    .from(products)
    .where(sellableWhere(or(textMatch, codeMatch)))
    .orderBy(asc(products.name))
    .limit(RESULT_LIMIT)
}

export interface ScanTarget {
  product: ProductRow
  /** Set when the code is a pack-size barcode — that pack is what gets added. */
  sellUnit: CartSellUnit | null
}

const toSellUnit = (p: { id: string; label: string; unitCount: number; sellingPriceCents: number }): CartSellUnit => ({
  packSizeId: p.id,
  label: p.label,
  unitCount: p.unitCount,
  priceCents: p.sellingPriceCents,
})

/** Exact barcode lookup: pack-size barcodes first (they're more specific), then GTIN / raw barcode. */
export async function findScanTarget(codes: string[]): Promise<ScanTarget | null> {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))]
  if (unique.length === 0) return null
  const packs = await db
    .select()
    .from(productPackSizes)
    .where(and(inArray(productPackSizes.barcode, unique), eq(productPackSizes.isActive, true)))
    .limit(1)
  if (packs[0] && packs[0].unitCount >= 1) {
    const [product] = await db.select().from(products).where(sellableWhere(eq(products.productId, packs[0].productId))).limit(1)
    if (product) return { product, sellUnit: packs[0].unitCount > 1 ? toSellUnit(packs[0]) : null }
  }
  const [product] = await db
    .select()
    .from(products)
    .where(sellableWhere(or(inArray(products.gtin, unique), inArray(products.barcodeRaw, unique))))
    .limit(1)
  return product ? { product, sellUnit: null } : null
}

/** Active pack sizes a product can be sold in (beyond its base unit), smallest first. */
export function listSellUnits(productId: string): CartSellUnit[] {
  return sqlite
    .getAllSync<{ id: string; label: string; unitCount: number; sellingPriceCents: number }>(
      `SELECT id, label, unit_count AS unitCount, selling_price_cents AS sellingPriceCents
       FROM product_pack_sizes WHERE product_id = ? AND is_active = 1 AND unit_count > 1 ORDER BY unit_count`,
      [productId],
    )
    .map(toSellUnit)
}

const saleCache = createSaleCache()

/** Recent sale lines on this device, newest first, as {product_id, quantity} sets. */
function recentSales(): SaleLike[] {
  if (OFFLINE_EDITION) {
    const rows = sqlite.getAllSync<{ saleId: string; productId: string | null; quantity: number }>(
      `SELECT si.sale_id AS saleId, si.product_id AS productId, si.quantity AS quantity
       FROM sale_items si JOIN (SELECT id FROM sales ORDER BY created_at DESC LIMIT 300) s ON s.id = si.sale_id`,
    )
    const bySale = new Map<string, SaleLike>()
    for (const r of rows) {
      if (!r.productId) continue
      const sale = bySale.get(r.saleId) ?? { items: [] }
      sale.items.push({ product_id: r.productId, quantity: r.quantity })
      bySale.set(r.saleId, sale)
    }
    return [...bySale.values()]
  }
  // Only new outbox rows are read and parsed (see logic/saleCache.ts).
  const seqs = sqlite
    .getAllSync<{ seq: number }>("SELECT seq FROM outbox WHERE type = 'sale' ORDER BY seq DESC LIMIT 300")
    .map((r) => r.seq)
  return recentSalesCached(saleCache, seqs, (missing) =>
    sqlite.getAllSync<{ seq: number; payload: string }>(
      `SELECT seq, payload FROM outbox WHERE seq IN (${missing.map(() => "?").join(",")})`,
      missing,
    ),
  )
}

/** "Quick add" tiles: this device's best sellers, topped up with the first catalogue products. */
export async function quickAddProducts(limit: number): Promise<ProductRow[]> {
  const ids = topSellers(recentSales(), limit)
  const ranked = ids.length
    ? await db.select().from(products).where(sellableWhere(inArray(products.productId, ids)))
    : []
  const byId = new Map(ranked.map((p) => [p.productId, p]))
  const out = ids.map((id) => byId.get(id)).filter((p): p is ProductRow => !!p)
  if (out.length < limit) {
    const filler = await db
      .select()
      .from(products)
      .where(sellableWhere())
      .orderBy(asc(products.name))
      .limit(limit * 2)
    for (const p of filler) {
      if (out.length >= limit) break
      if (!byId.has(p.productId)) out.push(p)
    }
  }
  return out
}

export async function getProduct(productId: string): Promise<ProductRow | null> {
  const [p] = await db.select().from(products).where(eq(products.productId, productId)).limit(1)
  return p ?? null
}
