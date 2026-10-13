import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm"
import * as Crypto from "expo-crypto"
import type { SQLiteStatement } from "expo-sqlite"
import { products, productBatches, stockAdjustments, categories } from "../db/schema"
import { db, sqlite } from "../db/database"
import { UserFacingError, userMessage } from "../lib/errors"
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
  // Badges (and the summary counts) need every matching product, but only
  // these five columns — the full rows are read for the visible page alone.
  // Expiry stays in JS so "≤ 90 days" is computed exactly as before.
  const slimCols = {
    productId: products.productId, stockOnHand: products.stockOnHand, reorderLevel: products.reorderLevel,
    earliestExpiry: products.earliestExpiry, isControlled: products.isControlled,
  }
  const slim = searchClause ? await db.select(slimCols).from(products).where(searchClause) : await db.select(slimCols).from(products)

  const withBadges = slim.map((r) => ({ id: r.productId, badges: statusBadges(r) }))
  const filtered = status === "all" ? withBadges : withBadges.filter((x) => x.badges.includes(status))
  const total = filtered.length
  const pageSlice = filtered.slice((page - 1) * limit, page * limit)

  const summary = { outOfStock: 0, lowStock: 0, expiring: 0, controlled: 0 }
  for (const { badges } of withBadges) {
    if (badges.includes("out_of_stock")) summary.outOfStock++
    if (badges.includes("low_stock")) summary.lowStock++
    if (badges.includes("expiring")) summary.expiring++
    if (badges.includes("controlled")) summary.controlled++
  }

  const fullRows = pageSlice.length > 0 ? await db.select().from(products).where(inArray(products.productId, pageSlice.map((x) => x.id))) : []
  const byId = new Map(fullRows.map((r) => [r.productId, r]))

  return {
    products: pageSlice.flatMap(({ id, badges }) => {
      const r = byId.get(id)
      if (!r) return []
      const days = r.earliestExpiry ? Math.ceil((new Date(r.earliestExpiry).getTime() - Date.now()) / 86_400_000) : null
      return [{
        product_id: r.productId, name: r.name, brand_name: r.brandName, strength: r.strength, gtin: r.gtin,
        selling_price: r.sellingPrice, cost_price: r.costPrice ?? null, stock_on_hand: r.stockOnHand,
        reorder_level: r.reorderLevel, earliest_expiry: r.earliestExpiry, expiry_days: days,
        is_controlled: r.isControlled, status_badges: badges,
      }]
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
  if (!batch) throw new UserFacingError("That batch no longer exists. Go back and refresh.")
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

// Rows per transaction: one commit (one fsync) per chunk instead of one per
// statement, with a yield between chunks so the import screen stays live.
const IMPORT_CHUNK = 250

interface ImportStatements {
  findParent: SQLiteStatement
  findChild: SQLiteStatement
  findTop: SQLiteStatement
  insertCategory: SQLiteStatement
  insertProduct: SQLiteStatement
  insertBatch: SQLiteStatement
  setStock: SQLiteStatement
}

/** Synchronous twin of findOrCreateCategoryId over prepared statements (same rules). */
function categoryIdSync(st: ImportStatements, name: string | undefined, parentName: string | undefined): string | null {
  if (!name?.trim()) return null
  let parentId: string | null = null
  if (parentName?.trim()) {
    const parent = st.findParent.executeSync<{ id: string }>([parentName.trim()]).getFirstSync()
    if (parent) parentId = parent.id
    else {
      parentId = Crypto.randomUUID()
      st.insertCategory.executeSync([parentId, parentName.trim(), null])
    }
  }
  const existing = parentId
    ? st.findChild.executeSync<{ id: string }>([name.trim(), parentId]).getFirstSync()
    : st.findTop.executeSync<{ id: string }>([name.trim()]).getFirstSync()
  if (existing) return existing.id
  const id = Crypto.randomUUID()
  st.insertCategory.executeSync([id, name.trim(), parentId])
  return id
}

/** Mirrors apps/web/app/api/inventory/import/route.ts's per-row behaviour:
 *  creates a product (+ an opening batch if opening_qty/batch_number/
 *  expiry_date are present) for each valid row. Same per-row results as the
 *  old one-await-per-statement loop: a failing row is reported and skipped,
 *  earlier rows stay. A brand-new product's only batch is the opening one,
 *  so its stock cache is set straight from it (what refreshProductStockCache
 *  would compute). */
export async function importLocalInventoryRows(branchId: string, rows: Record<string, string>[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, stockBatches: 0, failed: 0, total: rows.length, errors: [] }
  const st: ImportStatements = {
    findParent: sqlite.prepareSync("SELECT id FROM categories WHERE name = ? AND parent_id IS NULL LIMIT 1"),
    findChild: sqlite.prepareSync("SELECT id FROM categories WHERE name = ? AND parent_id = ? LIMIT 1"),
    findTop: sqlite.prepareSync("SELECT id FROM categories WHERE name = ? AND parent_id IS NULL LIMIT 1"),
    insertCategory: sqlite.prepareSync("INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)"),
    insertProduct: sqlite.prepareSync(
      `INSERT INTO products (product_id, name, brand_name, manufacturer, gtin, strength, dosage_form, base_unit, units_per_pack,
        selling_price, cost_price, reorder_level, is_controlled, requires_prescription, category_id, is_active,
        stock_on_hand, batch_count, earliest_expiry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, NULL)`,
    ),
    insertBatch: sqlite.prepareSync(
      `INSERT INTO product_batches (id, product_id, branch_id, batch_number, expiry_date, quantity_received, quantity_remaining,
        cost_price_cents, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    setStock: sqlite.prepareSync("UPDATE products SET stock_on_hand = ?, batch_count = 1, earliest_expiry = ? WHERE product_id = ?"),
  }

  const importRow = (row: Record<string, string>) => {
    const name = row.name?.trim()
    const sellingPrice = parseFloat(row.selling_price ?? "")
    if (!name || Number.isNaN(sellingPrice) || sellingPrice <= 0) {
      throw new UserFacingError("Missing name or valid selling_price")
    }
    const categoryId = categoryIdSync(st, row.subcategory || row.category, row.subcategory ? row.category : undefined)
    const productId = Crypto.randomUUID()
    const costPrice = row.cost_price?.trim() ? parseFloat(row.cost_price) : null
    st.insertProduct.executeSync([
      productId, name, row.brand_name?.trim() || null, row.manufacturer?.trim() || null,
      row.gtin?.trim() || null, row.strength?.trim() || null, row.dosage_form?.trim() || null,
      row.base_unit?.trim() || "unit", parseInt(row.units_per_pack ?? "1", 10) || 1,
      sellingPrice, costPrice != null && !Number.isNaN(costPrice) ? costPrice : null,
      parseInt(row.reorder_level ?? "10", 10) || 10,
      /^y/i.test(row.is_controlled ?? "") ? 1 : 0, /^y/i.test(row.requires_prescription ?? "") ? 1 : 0,
      categoryId,
    ])
    result.created++

    const openingQty = parseInt(row.opening_qty ?? "", 10)
    if (openingQty > 0 && row.batch_number?.trim() && row.expiry_date?.trim()) {
      const expiry = row.expiry_date.trim()
      st.insertBatch.executeSync([
        Crypto.randomUUID(), productId, branchId, row.batch_number.trim(), expiry, openingQty, openingQty,
        costPrice != null ? Math.round(costPrice * 100) : null, Date.now(),
      ])
      st.setStock.executeSync([openingQty, expiry, productId])
      result.stockBatches++
    }
  }

  try {
    for (let start = 0; start < rows.length; start += IMPORT_CHUNK) {
      if (start > 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
      sqlite.withTransactionSync(() => {
        for (let i = start; i < Math.min(start + IMPORT_CHUNK, rows.length); i++) {
          const row = rows[i]!
          try {
            importRow(row)
          } catch (err) {
            result.failed++
            result.errors.push({ row: i + 1, name: row.name ?? "?", error: userMessage(err, "Couldn't save this row") })
          }
        }
      })
    }
  } finally {
    for (const s of Object.values(st)) s.finalizeSync()
  }
  return result
}
