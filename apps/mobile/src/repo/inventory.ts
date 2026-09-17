import { and, asc, eq, like, or, sql } from "drizzle-orm"
import * as Crypto from "expo-crypto"
import { products, productBatches, stockAdjustments, categories } from "../db/schema"
import { db } from "../db/database"
import { refreshProductStockCache } from "./sales"

// ADR-014 — local repo for Inventory/Batches/CSV-import screens. Return
// shapes match the online API field-for-field.

function statusBadges(p: { stockOnHand: number | null; reorderLevel: number | null; earliestExpiry: string | null; isControlled: boolean }): string[] {
  const badges: string[] = []
  const stock = p.stockOnHand ?? 0
  if (stock <= 0) badges.push("out_of_stock")
  else if (p.reorderLevel != null && stock <= p.reorderLevel) badges.push("low_stock")
  if (p.earliestExpiry) {
    const days = Math.ceil((new Date(p.earliestExpiry).getTime() - Date.now()) / 86_400_000)
    if (days <= 90) badges.push("expiring")
  }
  if (p.isControlled) badges.push("controlled")
  return badges
}

export async function listLocalInventory(opts: { status: string; page: number; limit: number; q?: string }) {
  const { status, page, limit, q } = opts
  const searchClause = q && q.trim().length >= 2
    ? or(like(products.name, `%${q}%`), like(products.brandName, `%${q}%`))
    : undefined
  const rows = searchClause ? await db.select().from(products).where(searchClause) : await db.select().from(products)

  const withBadges = rows.map((r) => ({ row: r, badges: statusBadges(r) }))
  const filtered = status === "all" ? withBadges : withBadges.filter((x) => x.badges.includes(status))
  const total = filtered.length
  const pageRows = filtered.slice((page - 1) * limit, page * limit)

  const summary = {
    outOfStock: withBadges.filter((x) => x.badges.includes("out_of_stock")).length,
    lowStock: withBadges.filter((x) => x.badges.includes("low_stock")).length,
    expiring: withBadges.filter((x) => x.badges.includes("expiring")).length,
    controlled: withBadges.filter((x) => x.badges.includes("controlled")).length,
  }

  return {
    products: pageRows.map(({ row: r, badges }) => {
      const days = r.earliestExpiry ? Math.ceil((new Date(r.earliestExpiry).getTime() - Date.now()) / 86_400_000) : null
      return {
        product_id: r.productId, name: r.name, brand_name: r.brandName, strength: r.strength, gtin: r.gtin,
        selling_price: r.sellingPrice, cost_price: r.costPrice ?? null, stock_on_hand: r.stockOnHand,
        reorder_level: r.reorderLevel, earliest_expiry: r.earliestExpiry, expiry_days: days,
        is_controlled: r.isControlled, status_badges: badges,
      }
    }),
    total, page, limit, summary,
  }
}

function toBatchDTO(b: typeof productBatches.$inferSelect) {
  return {
    id: b.id, batch_number: b.batchNumber, expiry_date: b.expiryDate,
    quantity_remaining: b.quantityRemaining, quantity_received: b.quantityReceived,
    cost_price: b.costPriceCents != null ? (b.costPriceCents / 100).toFixed(2) : null,
  }
}

export async function listLocalBatches(productId: string, branchId: string) {
  const rows = await db.select().from(productBatches)
    .where(and(eq(productBatches.productId, productId), eq(productBatches.branchId, branchId)))
    .orderBy(asc(productBatches.expiryDate))
  return { batches: rows.map(toBatchDTO) }
}

export async function receiveLocalStock(input: {
  productId: string; branchId: string; batchNumber: string; expiryDate: string
  quantityReceived: number; costPrice?: number | null
}): Promise<void> {
  await db.insert(productBatches).values({
    id: Crypto.randomUUID(), productId: input.productId, branchId: input.branchId,
    batchNumber: input.batchNumber, expiryDate: input.expiryDate,
    quantityReceived: input.quantityReceived, quantityRemaining: input.quantityReceived,
    costPriceCents: input.costPrice != null ? Math.round(input.costPrice * 100) : null,
    receivedAt: Date.now(),
  })
  await refreshProductStockCache(input.productId, input.branchId)
}

export async function adjustLocalStock(input: { batchId: string; delta: number; reason: string; note?: string | null }): Promise<void> {
  const [batch] = await db.select().from(productBatches).where(eq(productBatches.id, input.batchId)).limit(1)
  if (!batch) throw new Error("Batch not found")
  const before = batch.quantityRemaining
  const after = Math.max(0, before + input.delta)
  await db.update(productBatches).set({ quantityRemaining: after }).where(eq(productBatches.id, input.batchId))
  await db.insert(stockAdjustments).values({
    id: Crypto.randomUUID(), batchId: input.batchId, reason: input.reason,
    delta: input.delta, quantityBefore: before, quantityAfter: after,
    note: input.note ?? null, createdAt: Date.now(),
  })
  await refreshProductStockCache(batch.productId, batch.branchId)
}

export async function findOrCreateCategoryId(name: string | undefined, parentName: string | undefined): Promise<string | null> {
  if (!name?.trim()) return null
  let parentId: string | null = null
  if (parentName?.trim()) {
    const [existingParent] = await db.select().from(categories).where(and(eq(categories.name, parentName.trim()), sql`${categories.parentId} is null`)).limit(1)
    if (existingParent) parentId = existingParent.id
    else {
      parentId = Crypto.randomUUID()
      await db.insert(categories).values({ id: parentId, name: parentName.trim(), parentId: null })
    }
  }
  const [existing] = await db.select().from(categories).where(and(eq(categories.name, name.trim()), parentId ? eq(categories.parentId, parentId) : sql`${categories.parentId} is null`)).limit(1)
  if (existing) return existing.id
  const id = Crypto.randomUUID()
  await db.insert(categories).values({ id, name: name.trim(), parentId })
  return id
}

export interface ImportResult { created: number; stockBatches: number; failed: number; total: number; errors: { row: number; name: string; error: string }[] }

/** Mirrors apps/web/app/api/inventory/import/route.ts's per-row behaviour:
 *  creates a product (+ an opening batch if opening_qty/batch_number/
 *  expiry_date are present) for each valid row. */
export async function importLocalInventoryRows(branchId: string, rows: Record<string, string>[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, stockBatches: 0, failed: 0, total: rows.length, errors: [] }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    try {
      const name = row.name?.trim()
      const sellingPrice = parseFloat(row.selling_price ?? "")
      if (!name || Number.isNaN(sellingPrice) || sellingPrice <= 0) {
        throw new Error("Missing name or valid selling_price")
      }
      const categoryId = await findOrCreateCategoryId(row.subcategory || row.category, row.subcategory ? row.category : undefined)
      const productId = Crypto.randomUUID()
      const costPrice = row.cost_price?.trim() ? parseFloat(row.cost_price) : null
      await db.insert(products).values({
        productId, name, brandName: row.brand_name?.trim() || null, manufacturer: row.manufacturer?.trim() || null,
        gtin: row.gtin?.trim() || null, strength: row.strength?.trim() || null, dosageForm: row.dosage_form?.trim() || null,
        baseUnit: row.base_unit?.trim() || "unit", unitsPerPack: parseInt(row.units_per_pack ?? "1", 10) || 1,
        sellingPrice, costPrice: costPrice != null && !Number.isNaN(costPrice) ? costPrice : null,
        reorderLevel: parseInt(row.reorder_level ?? "10", 10) || 10,
        isControlled: /^y/i.test(row.is_controlled ?? ""), requiresPrescription: /^y/i.test(row.requires_prescription ?? ""),
        categoryId, isActive: true, stockOnHand: 0, batchCount: 0, earliestExpiry: null,
      })
      result.created++

      const openingQty = parseInt(row.opening_qty ?? "", 10)
      if (openingQty > 0 && row.batch_number?.trim() && row.expiry_date?.trim()) {
        await receiveLocalStock({
          productId, branchId, batchNumber: row.batch_number.trim(), expiryDate: row.expiry_date.trim(),
          quantityReceived: openingQty, costPrice,
        })
        result.stockBatches++
      }
    } catch (err) {
      result.failed++
      result.errors.push({ row: i + 1, name: row.name ?? "?", error: err instanceof Error ? err.message : "Error" })
    }
  }
  return result
}
