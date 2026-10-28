import { and, eq, inArray, sql } from "drizzle-orm"
import {
  audit_log, controlled_substance_log, dbAdmin, drug_catalog, product, product_batch, stock_adjustment,
  stock_count, stock_count_line, type DrizzleDB,
} from "@pharmatrack/db"
import { applyCount, countDelta, generateInternalBarcode, summariseCount, taxonomyKey, type CountLineFacts, type CountSummary } from "@pharmatrack/core"
import { resolveDefaultCategory } from "@/lib/catalog/defaultCategory"
import { deriveGenericName } from "@/lib/generic-name"
import { findBarcodeConflict } from "@/lib/products/barcodeConflict"

// Stock take (ADR-020) — turning a counted session into stock. `planSession`
// is read-only (the review screen and the approval check); `postSession`
// applies it in the caller's tenant transaction.

type Session = typeof stock_count.$inferSelect
type Line = typeof stock_count_line.$inferSelect
type Catalog = typeof drug_catalog.$inferSelect

export interface PlanRow {
  line: Line
  kind: CountLineFacts["kind"]
  name: string
  productId: string | null
  catalog: Catalog | null
  batch: { id: string; quantity_remaining: number; batch_number: string; expiry_date: string } | null
  expected: number | null
  delta: number
  unitCost: number | null
  controlled: boolean
}
export interface Plan {
  rows: PlanRow[]
  summary: CountSummary
  /** Own products getting a confirmed price (setup). */
  pricesSet: number
  /** Lines skipped because their batch has gone (deleted) or moved branch. */
  skipped: number
}

const num = (v: string | number | null | undefined) => (v == null || v === "" ? null : Number(v))
const nameKey = (n: string, st?: string | null, f?: string | null) => `${n.trim().toLowerCase()}|${(st ?? "").trim().toLowerCase()}|${(f ?? "").trim().toLowerCase()}`
const isGtin = (code: string) => /^(\d{8}|\d{12,14})$/.test(code)

export async function planSession(db: DrizzleDB, session: Session): Promise<Plan> {
  const lines = await db.select().from(stock_count_line).where(eq(stock_count_line.count_id, session.id))
  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean) as string[])]
  const batchIds = [...new Set(lines.map((l) => l.batch_id).filter(Boolean) as string[])]
  const catalogIds = [...new Set(lines.filter((l) => !l.product_id).map((l) => l.catalog_id).filter(Boolean) as string[])]
  const [products, batches, catalog] = await Promise.all([
    productIds.length ? db.select({ id: product.id, name: product.name, cost_price: product.cost_price, selling_price: product.selling_price, is_active: product.is_active, is_controlled: product.is_controlled })
      .from(product).where(inArray(product.id, productIds)) : [],
    batchIds.length ? db.select({ id: product_batch.id, product_id: product_batch.product_id, branch_id: product_batch.branch_id, quantity_remaining: product_batch.quantity_remaining, cost_price: product_batch.cost_price, batch_number: product_batch.batch_number, expiry_date: product_batch.expiry_date })
      .from(product_batch).where(inArray(product_batch.id, batchIds)) : [],
    catalogIds.length ? dbAdmin().select().from(drug_catalog).where(inArray(drug_catalog.id, catalogIds)) : [],
  ])
  const pById = new Map(products.map((p) => [p.id, p]))
  const bById = new Map(batches.map((b) => [b.id, b]))
  const cById = new Map(catalog.map((c) => [c.id, c]))

  const rows: PlanRow[] = []
  let skipped = 0
  const priced = new Set<string>()
  for (const line of lines) {
    if (line.product_id) {
      const p = pById.get(line.product_id)
      if (!p) { skipped++; continue }
      if (line.price_confirmed && Number(line.selling_price ?? 0) > 0 && !(Number(p.selling_price ?? 0) > 0 && p.is_active)) priced.add(p.id)
      if (line.batch_id) {
        const b = bById.get(line.batch_id)
        if (!b || b.branch_id !== session.branch_id || b.product_id !== p.id) { skipped++; continue }
        rows.push({
          line, kind: "batch", name: p.name, productId: p.id, catalog: null,
          batch: { id: b.id, quantity_remaining: b.quantity_remaining, batch_number: b.batch_number, expiry_date: String(b.expiry_date) },
          expected: line.expected_qty, delta: countDelta(line.counted_qty, line.expected_qty),
          unitCost: num(b.cost_price) ?? num(p.cost_price), controlled: p.is_controlled,
        })
      } else {
        rows.push({ line, kind: "new_batch", name: p.name, productId: p.id, catalog: null, batch: null, expected: null, delta: line.counted_qty, unitCost: num(line.cost_price) ?? num(p.cost_price), controlled: p.is_controlled })
      }
    } else {
      const c = line.catalog_id ? cById.get(line.catalog_id) : undefined
      if (!c) { skipped++; continue }
      rows.push({ line, kind: "new_product", name: c.name, productId: null, catalog: c, batch: null, expected: null, delta: line.counted_qty, unitCost: num(line.cost_price), controlled: c.is_controlled })
    }
  }
  // One "new product" per catalogue item, priced if any of its lines confirmed a price.
  const facts: CountLineFacts[] = []
  const seenCatalog = new Set<string>()
  for (const r of rows) {
    if (r.kind === "new_product") {
      if (seenCatalog.has(r.catalog!.id)) continue
      seenCatalog.add(r.catalog!.id)
      const confirmed = rows.some((x) => x.catalog?.id === r.catalog!.id && x.line.price_confirmed && Number(x.line.selling_price ?? 0) > 0)
      facts.push({ kind: "new_product", counted: r.line.counted_qty, expected: null, unitCost: r.unitCost, controlled: r.controlled, priceConfirmed: confirmed })
    } else {
      facts.push({ kind: r.kind, counted: r.line.counted_qty, expected: r.expected, unitCost: r.unitCost, controlled: r.controlled })
    }
  }
  return { rows, summary: summariseCount(facts), pricesSet: priced.size, skipped }
}

/**
 * Apply a planned session. Batch quantities are re-read under a row lock and
 * the counted difference is applied to the quantity *now* (sales since the
 * count still come off). Returns the totals stored on the session.
 */
export async function postSession(db: DrizzleDB, ctx: { organizationId: string; userId: string }, session: Session, plan: Plan) {
  const note = `Stock take: ${session.title}`
  let adjusted = 0, batchesAdded = 0, productsAdded = 0, pricesSet = 0
  const results = new Map<string, Record<string, unknown>>()

  async function setBarcode(productId: string, code: string | null) {
    if (!code) return
    const [p] = await db.select({ gtin: product.gtin, barcode_raw: product.barcode_raw }).from(product).where(eq(product.id, productId)).limit(1)
    if (!p || p.gtin === code || p.barcode_raw === code) return
    if (await findBarcodeConflict(db, ctx.organizationId, [code], { productId })) return
    if (isGtin(code) && !p.gtin) await db.update(product).set({ gtin: code, updated_at: new Date() }).where(eq(product.id, productId))
    else if (!isGtin(code)) await db.update(product).set({ barcode_raw: code, updated_at: new Date() }).where(eq(product.id, productId))
  }
  async function addBatch(productId: string, line: Line, fallbackCost: string | null) {
    if (line.counted_qty <= 0 || !line.expiry_date) return null
    const [b] = await db.insert(product_batch).values({
      organization_id: ctx.organizationId, product_id: productId, branch_id: session.branch_id,
      batch_number: line.batch_number?.trim() || "COUNT", expiry_date: String(line.expiry_date),
      quantity_received: line.counted_qty, quantity_remaining: line.counted_qty,
      cost_price: line.cost_price ?? fallbackCost, received_by: ctx.userId,
    }).returning({ id: product_batch.id })
    batchesAdded++
    return b!.id
  }

  // 1. Known batches: the difference, applied to stock now.
  for (const r of plan.rows.filter((x) => x.kind === "batch")) {
    const [b] = await db.select({ q: product_batch.quantity_remaining, received: product_batch.quantity_received, batch_number: product_batch.batch_number })
      .from(product_batch).where(eq(product_batch.id, r.batch!.id)).for("update").limit(1)
    if (!b) continue
    const after = applyCount(b.q, r.line.counted_qty, r.expected)
    if (after === b.q) { results.set(r.line.id, { unchanged: true }); continue }
    await db.update(product_batch).set({ quantity_remaining: after, quantity_received: Math.max(b.received, after) }).where(eq(product_batch.id, r.batch!.id))
    await db.insert(stock_adjustment).values({
      organization_id: ctx.organizationId, batch_id: r.batch!.id, reason: "count_correction", delta: after - b.q,
      quantity_before: b.q, quantity_after: after, note, adjusted_by: ctx.userId,
    })
    if (r.controlled) await db.insert(controlled_substance_log).values({ organization_id: ctx.organizationId, quantity: after - b.q, batch_number: b.batch_number })
    adjusted++
    results.set(r.line.id, { before: b.q, after })
  }

  // 2. Own products: batches found, confirmed prices, scanned barcodes.
  const ownRows = plan.rows.filter((x) => x.productId && x.kind !== "new_product")
  for (const productId of new Set(ownRows.map((r) => r.productId!))) {
    const mine = ownRows.filter((r) => r.productId === productId)
    const priced = mine.find((r) => r.line.price_confirmed && Number(r.line.selling_price ?? 0) > 0)
    const [p] = await db.select({ cost_price: product.cost_price, selling_price: product.selling_price, is_active: product.is_active }).from(product).where(eq(product.id, productId)).limit(1)
    if (priced && p && !(Number(p.selling_price ?? 0) > 0 && p.is_active)) {
      await db.update(product).set({
        selling_price: String(priced.line.selling_price), is_active: true, updated_at: new Date(),
        ...(priced.line.cost_price != null ? { cost_price: String(priced.line.cost_price) } : {}),
      }).where(eq(product.id, productId))
      pricesSet++
    }
    for (const r of mine) {
      if (r.kind === "new_batch") {
        const id = await addBatch(productId, r.line, p?.cost_price ?? null)
        results.set(r.line.id, { batch_id: id })
      }
      await setBarcode(productId, r.line.barcode)
    }
  }

  // 3. Catalogue items found on the shelf: one product each, then its batches.
  const newRows = plan.rows.filter((x) => x.kind === "new_product")
  const catIdByKey = new Map<string, string | null>()
  const mine = await db.select({ id: product.id, catalog_id: product.catalog_id, name: product.name, strength: product.strength, dosage_form: product.dosage_form }).from(product)
  const byCatalog = new Map(mine.filter((m) => m.catalog_id).map((m) => [m.catalog_id!, m.id]))
  const byName = new Map(mine.map((m) => [nameKey(m.name, m.strength, m.dosage_form), m.id]))
  for (const catalogId of new Set(newRows.map((r) => r.catalog!.id))) {
    const group = newRows.filter((r) => r.catalog!.id === catalogId)
    const c = group[0]!.catalog!
    let productId = byCatalog.get(c.id) ?? byName.get(nameKey(c.name, c.strength, c.dosage_form)) ?? null
    const priced = group.find((r) => r.line.price_confirmed && Number(r.line.selling_price ?? 0) > 0)
    const costLine = group.find((r) => r.line.cost_price != null)
    if (!productId) {
      const key = c.category ? taxonomyKey(c.category, c.subcategory) : null
      if (key && !catIdByKey.has(key)) catIdByKey.set(key, await resolveDefaultCategory(db, ctx.organizationId, key))
      const code = group.map((r) => r.line.barcode).find(Boolean) ?? null
      const free = code && !(await findBarcodeConflict(db, ctx.organizationId, [code])) ? code : null
      let barcodeRaw: string | null = free && !isGtin(free) ? free : null
      if (!free) {
        for (let i = 0; i < 5 && !barcodeRaw; i++) {
          const candidate = generateInternalBarcode()
          if (!(await findBarcodeConflict(db, ctx.organizationId, [candidate]))) barcodeRaw = candidate
        }
      }
      const [created] = await db.insert(product).values({
        organization_id: ctx.organizationId, created_by: ctx.userId, catalog_id: c.id,
        category_id: key ? catIdByKey.get(key) ?? null : null,
        name: c.name, brand_name: c.brand_name, generic_name: c.generic_name ?? deriveGenericName(c.name), manufacturer: c.manufacturer,
        gtin: free && isGtin(free) ? free : c.gtin, barcode_raw: barcodeRaw,
        strength: c.strength, dosage_form: c.dosage_form, base_unit: c.base_unit,
        pack_label: c.default_pack_label, units_per_pack: c.default_units_per_pack ?? 1,
        cost_price: costLine?.line.cost_price ?? null,
        // Only a price someone confirmed; otherwise it waits, off sale (ADR-020).
        selling_price: priced ? String(priced.line.selling_price) : "0",
        is_active: !!priced,
        reorder_level: 3, is_controlled: c.is_controlled, requires_prescription: c.requires_prescription,
      }).returning({ id: product.id })
      productId = created!.id
      productsAdded++
      if (priced) pricesSet++
    }
    for (const r of group) {
      const id = await addBatch(productId, r.line, costLine?.line.cost_price ?? null)
      results.set(r.line.id, { product_id: productId, batch_id: id })
    }
  }

  for (const [id, result] of results) await db.update(stock_count_line).set({ result }).where(eq(stock_count_line.id, id))
  const totals = {
    adjusted, batchesAdded, productsAdded, pricesSet, unpriced: plan.summary.unpriced,
    unitsFound: plan.summary.unitsFound, unitsMissing: plan.summary.unitsMissing,
    valueFound: plan.summary.valueFound, valueMissing: plan.summary.valueMissing, lines: plan.summary.counted,
  }
  await db.update(stock_count).set({ status: "posted", posted_by: ctx.userId, posted_at: new Date(), totals, updated_at: new Date() })
    .where(and(eq(stock_count.id, session.id), sql`${stock_count.status} <> 'posted'`))
  await db.insert(audit_log).values({
    organization_id: ctx.organizationId, actor_id: ctx.userId, action: "stock_take.post", entity: "stock_count", entity_id: session.id,
    diff: { title: session.title, kind: session.kind, branch_id: session.branch_id, ...totals },
  })
  return totals
}
