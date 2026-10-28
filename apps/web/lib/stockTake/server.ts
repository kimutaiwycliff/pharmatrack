import { and, asc, eq, gt, ilike, inArray, isNotNull, max, or, sql, type SQL } from "drizzle-orm"
import {
  category, drug_catalog, product, product_batch, stock_count, stock_count_line, dbAdmin, type DrizzleDB,
} from "@pharmatrack/db"
import { DEFAULT_TAXONOMY, findTaxonomyEntry, taxonomyKey } from "@pharmatrack/core"
import { NextResponse } from "next/server"
import { getTenantContext, requireActiveSubscription, type TenantContext } from "@/lib/auth/helpers"
import { forbidden } from "@/lib/api-auth"

// Stock take (ADR-020) — shelves and what's on them. A shelf is one of the
// pharmacy's categories, or a default department/subcategory (the taxonomy the
// shared catalogue uses) that the pharmacy doesn't have yet, so a brand-new
// pharmacy can set up shelf by shelf. Everything here runs inside the caller's
// tenant transaction except the shared catalogue reads (dbAdmin, no tenant data).

export interface Shelf {
  /** "c:<category id>" or "t:<taxonomy key>" */
  id: string
  name: string
  categoryId: string | null
  taxonomyKey: string | null
  products: number
  /** Common catalogue items for this shelf (setup). */
  catalog: number
  lastCounted: string | null
  children: Shelf[]
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const DEPARTMENTS = Object.keys(DEFAULT_TAXONOMY) as Array<keyof typeof DEFAULT_TAXONOMY>
const curated = eq(drug_catalog.source, "curated")

export function departmentForKey(key: string): string | null {
  return DEPARTMENTS.find((d) => taxonomyKey(d) === key) ?? null
}

export async function listShelves(db: DrizzleDB, branchId: string): Promise<Shelf[]> {
  const [cats, counts, catalogCounts, last] = await Promise.all([
    db.select({ id: category.id, name: category.name, parent_id: category.parent_id, default_key: category.default_key }).from(category),
    db.select({ category_id: product.category_id, n: sql<number>`count(*)::int` }).from(product).groupBy(product.category_id),
    dbAdmin().select({ category: drug_catalog.category, subcategory: drug_catalog.subcategory, n: sql<number>`count(*)::int` })
      .from(drug_catalog).where(and(curated, isNotNull(drug_catalog.category))).groupBy(drug_catalog.category, drug_catalog.subcategory),
    db.select({ category_id: stock_count.scope_category_id, key: stock_count.scope_key, at: max(stock_count.posted_at) })
      .from(stock_count).where(and(eq(stock_count.branch_id, branchId), eq(stock_count.status, "posted")))
      .groupBy(stock_count.scope_category_id, stock_count.scope_key),
  ])
  const productsIn = new Map(counts.map((c) => [c.category_id, c.n]))
  const catalogIn = new Map<string, number>()
  for (const c of catalogCounts) {
    const k = taxonomyKey(c.category!, c.subcategory)
    catalogIn.set(k, (catalogIn.get(k) ?? 0) + c.n)
    const dk = taxonomyKey(c.category!)
    catalogIn.set(dk, (catalogIn.get(dk) ?? 0) + c.n)
  }
  const lastBy = new Map<string, string>()
  for (const l of last) {
    const at = l.at ? new Date(l.at).toISOString() : null
    if (!at) continue
    for (const k of [l.category_id && `c:${l.category_id}`, l.key && `t:${l.key}`]) {
      if (k && (!lastBy.has(k) || lastBy.get(k)! < at)) lastBy.set(k, at)
    }
  }
  const lastFor = (catId: string | null, key: string | null) => {
    const a = catId ? lastBy.get(`c:${catId}`) : undefined
    const b = key ? lastBy.get(`t:${key}`) : undefined
    return [a, b].filter(Boolean).sort().pop() ?? null
  }
  const parents = cats.filter((c) => !c.parent_id)
  const kidsOf = (id: string) => cats.filter((c) => c.parent_id === id)
  const used = new Set<string>()

  const leaf = (catId: string | null, key: string | null, name: string): Shelf => {
    if (catId) used.add(catId)
    return {
      id: catId ? `c:${catId}` : `t:${key}`, name, categoryId: catId, taxonomyKey: key,
      products: catId ? productsIn.get(catId) ?? 0 : 0, catalog: key ? catalogIn.get(key) ?? 0 : 0,
      lastCounted: lastFor(catId, key), children: [],
    }
  }
  const withTotals = (s: Shelf): Shelf => {
    const own = s.categoryId ? productsIn.get(s.categoryId) ?? 0 : 0
    return { ...s, products: own + s.children.reduce((n, c) => n + c.products, 0) }
  }

  const shelves: Shelf[] = []
  for (const dept of DEPARTMENTS) {
    const dk = taxonomyKey(dept)
    const cat = parents.find((p) => p.default_key === dk) ?? parents.find((p) => same(p.name, dept)) ?? null
    const shelf = leaf(cat?.id ?? null, dk, cat?.name ?? dept)
    const kids = cat ? kidsOf(cat.id) : []
    for (const sub of DEFAULT_TAXONOMY[dept]) {
      const sk = taxonomyKey(dept, sub)
      const c = kids.find((k) => k.default_key === sk) ?? kids.find((k) => same(k.name, sub)) ?? cats.find((k) => k.default_key === sk) ?? null
      shelf.children.push(leaf(c?.id ?? null, sk, c?.name ?? sub))
    }
    for (const k of kids) if (!used.has(k.id)) shelf.children.push(leaf(k.id, null, k.name))
    shelves.push(withTotals(shelf))
  }
  // The pharmacy's own departments that aren't defaults.
  for (const p of parents) {
    if (used.has(p.id)) continue
    const shelf = leaf(p.id, null, p.name)
    for (const k of kidsOf(p.id)) if (!used.has(k.id)) shelf.children.push(leaf(k.id, null, k.name))
    shelves.push(withTotals(shelf))
  }
  return shelves
}

/** A shelf the client asked for → what to store on the session (validated). */
export async function resolveScope(db: DrizzleDB, input: { category_id?: string | null; taxonomy_key?: string | null }) {
  let categoryId: string | null = null, key: string | null = null, name: string | null = null
  if (input.category_id) {
    const [c] = await db.select({ id: category.id, name: category.name, default_key: category.default_key }).from(category).where(eq(category.id, input.category_id)).limit(1)
    if (!c) return null
    categoryId = c.id; name = c.name; key = c.default_key
  }
  if (input.taxonomy_key) {
    const k = input.taxonomy_key
    const entry = findTaxonomyEntry(k)
    const dept = entry ? null : departmentForKey(k)
    if (!entry && !dept) return null
    key = k
    name ??= entry ? entry.subcategory : dept
  }
  if (!categoryId && !key) return null
  return { categoryId, key, name: name! }
}

export interface StockTakeBatch { id: string; batchNumber: string; expiry: string; qty: number | null; unitCost: number | null }
export interface StockTakeItem {
  /** "p:<product id>" or "k:<catalogue id>" */
  key: string
  productId: string | null
  catalogId: string | null
  name: string
  detail: string
  group: string
  baseUnit: string
  packLabel: string | null
  unitsPerPack: number
  controlled: boolean
  /** Own product that can't be sold yet (no price). */
  needsPrice: boolean
  sellingPrice: number | null
  /** Catalogue reference prices (setup): selling per base unit, cost per base unit. */
  suggestedSell: number | null
  suggestedCost: number | null
  costPrice: number | null
  barcodes: string[]
  common: boolean
  batches: StockTakeBatch[]
}

const num = (v: string | number | null | undefined) => (v == null || v === "" ? null : Number(v))
const nameKey = (n: string, st?: string | null, f?: string | null) => `${n.trim().toLowerCase()}|${(st ?? "").trim().toLowerCase()}|${(f ?? "").trim().toLowerCase()}`

/** Category ids on a shelf (the shelf and its subcategories). */
async function scopeCategoryIds(db: DrizzleDB, scope: { categoryId: string | null; key: string | null }): Promise<string[]> {
  const cats = await db.select({ id: category.id, parent_id: category.parent_id, default_key: category.default_key }).from(category)
  const ids = new Set<string>()
  if (scope.categoryId) ids.add(scope.categoryId)
  if (scope.key) for (const c of cats) if (c.default_key === scope.key || c.default_key?.startsWith(`${scope.key}/`)) ids.add(c.id)
  for (const c of cats) if (c.parent_id && ids.has(c.parent_id)) ids.add(c.id)
  return [...ids]
}

const detail = (st: string | null, f: string | null, pack: string | null) => [st, f, pack].filter(Boolean).join(" · ")

/** The pharmacy's products (matching `where`) as count rows, with their batches at this branch. */
export async function productItems(db: DrizzleDB, where: SQL | undefined, args: { branchId: string; showCost: boolean; hideQty: boolean; group?: string; limit?: number }): Promise<StockTakeItem[]> {
  const catNames = new Map((await db.select({ id: category.id, name: category.name }).from(category)).map((c) => [c.id, c.name]))
  const q = db.select({
    id: product.id, name: product.name, strength: product.strength, dosage_form: product.dosage_form, base_unit: product.base_unit,
    pack_label: product.pack_label, units_per_pack: product.units_per_pack, cost_price: product.cost_price, selling_price: product.selling_price,
    is_active: product.is_active, is_controlled: product.is_controlled, gtin: product.gtin, barcode_raw: product.barcode_raw,
    catalog_id: product.catalog_id, category_id: product.category_id,
  }).from(product).where(where).orderBy(asc(product.name))
  const own = args.limit ? await q.limit(args.limit) : await q
  const batches = own.length
    ? await db.select({ id: product_batch.id, product_id: product_batch.product_id, batch_number: product_batch.batch_number, expiry_date: product_batch.expiry_date, qty: product_batch.quantity_remaining, cost_price: product_batch.cost_price })
      .from(product_batch)
      .where(and(inArray(product_batch.product_id, own.map((p) => p.id)), eq(product_batch.branch_id, args.branchId), gt(product_batch.quantity_remaining, 0)))
      .orderBy(asc(product_batch.expiry_date))
    : []
  const batchesOf = new Map<string, StockTakeBatch[]>()
  for (const b of batches) {
    const list = batchesOf.get(b.product_id) ?? []
    list.push({ id: b.id, batchNumber: b.batch_number, expiry: String(b.expiry_date), qty: args.hideQty ? null : b.qty, unitCost: args.showCost ? num(b.cost_price) : null })
    batchesOf.set(b.product_id, list)
  }
  return own.map((p) => ({
    key: `p:${p.id}`, productId: p.id, catalogId: p.catalog_id, name: p.name, detail: detail(p.strength, p.dosage_form, p.pack_label),
    group: args.group ?? ((p.category_id && catNames.get(p.category_id)) || "Other"), baseUnit: p.base_unit, packLabel: p.pack_label, unitsPerPack: p.units_per_pack ?? 1,
    controlled: p.is_controlled, needsPrice: !(Number(p.selling_price ?? 0) > 0) || !p.is_active, sellingPrice: num(p.selling_price),
    suggestedSell: null, suggestedCost: null, costPrice: args.showCost ? num(p.cost_price) : null,
    barcodes: [p.gtin, p.barcode_raw].filter(Boolean) as string[], common: true, batches: batchesOf.get(p.id) ?? [],
  }))
}

/** A shared catalogue row as a count row (setup: creates the product when posted). */
export function catalogItem(c: typeof drug_catalog.$inferSelect, showCost: boolean, group?: string): StockTakeItem {
  return {
    key: `k:${c.id}`, productId: null, catalogId: c.id, name: c.name, detail: detail(c.strength, c.dosage_form, c.default_pack_label),
    group: group ?? c.subcategory ?? c.category ?? "Other", baseUnit: c.base_unit, packLabel: c.default_pack_label, unitsPerPack: c.default_units_per_pack ?? 1,
    controlled: c.is_controlled, needsPrice: true, sellingPrice: null,
    suggestedSell: Number(c.default_selling_price ?? 0) > 0 ? Number(c.default_selling_price) : null,
    suggestedCost: showCost && Number(c.default_cost_price ?? 0) > 0 ? Number(c.default_cost_price) : null,
    costPrice: null, barcodes: [], common: c.source === "curated", batches: [],
  }
}

/**
 * What's on a shelf: the pharmacy's products in it with their batches at this
 * branch, and (for setup, or when searching) catalogue items it doesn't have
 * yet — most-stocked first. `all` adds the PPB register; `q` searches the
 * whole catalogue ("found something not on this list").
 */
export async function loadShelfItems(db: DrizzleDB, args: {
  organizationId: string; branchId: string; scope: { categoryId: string | null; key: string | null }
  includeCatalog: boolean; all?: boolean; q?: string; showCost: boolean; hideQty: boolean
}): Promise<StockTakeItem[]> {
  const catIds = await scopeCategoryIds(db, args.scope)
  const items = catIds.length ? await productItems(db, inArray(product.category_id, catIds), args) : []
  if (!args.includeCatalog) return items

  let where: SQL | undefined
  if (args.q) {
    where = or(ilike(drug_catalog.name, `%${args.q}%`), ilike(drug_catalog.generic_name, `%${args.q}%`))
  } else {
    const entry = args.scope.key ? findTaxonomyEntry(args.scope.key) : null
    const dept = entry ? entry.category : args.scope.key ? departmentForKey(args.scope.key) : null
    if (!dept) return items
    where = and(eq(drug_catalog.category, dept), entry ? eq(drug_catalog.subcategory, entry.subcategory) : undefined, args.all ? undefined : curated)
  }
  const rows = await dbAdmin().select().from(drug_catalog).where(where).orderBy(asc(drug_catalog.name)).limit(args.q ? 60 : args.all ? 800 : 600)
  // Never offer what the pharmacy already has (anywhere, not just this shelf).
  const mine = await db.select({ catalog_id: product.catalog_id, name: product.name, strength: product.strength, dosage_form: product.dosage_form }).from(product)
  const ownCatalog = new Set(mine.map((m) => m.catalog_id).filter(Boolean))
  const ownNames = new Set(mine.map((m) => nameKey(m.name, m.strength, m.dosage_form)))
  const fresh = rows.filter((c) => !ownCatalog.has(c.id) && !ownNames.has(nameKey(c.name, c.strength, c.dosage_form)))
  // Most-stocked first: how many pharmacies carry each item (a count only).
  const pop = fresh.length
    ? await dbAdmin().select({ id: product.catalog_id, n: sql<number>`count(distinct ${product.organization_id})::int` })
      .from(product).where(inArray(product.catalog_id, fresh.map((c) => c.id))).groupBy(product.catalog_id)
    : []
  const popularity = new Map(pop.map((p) => [p.id, p.n]))
  fresh.sort((a, b) => Number(b.source === "curated") - Number(a.source === "curated") || (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0) || a.name.localeCompare(b.name))
  for (const c of fresh) items.push(catalogItem(c, args.showCost))
  return items
}

export type CountLine = typeof stock_count_line.$inferSelect

/** Every stock-take route: signed in, subscription active, may count stock. */
export async function stockTakeContext(): Promise<{ ctx: TenantContext } | { error: NextResponse }> {
  const ctx = await getTenantContext()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return { error: subErr }
  if (!ctx.permissions.includes("stock.count")) return { error: forbidden("stock.count") }
  return { ctx }
}
