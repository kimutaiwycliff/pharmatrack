import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNotNull, inArray, sql } from "drizzle-orm"
import { dbAdmin, withTenant, drug_catalog, product, product_batch, sale_item, category } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { z } from "zod"

// Quick Start: materialise the shared drug_catalog into an org's products by
// department — created ACTIVE and PRICED from the catalog's reference prices so
// they are immediately visible (product_stock shows active products at stock 0,
// see migration 008) and sellable. The tenant then tunes price + opening qty in
// the review grid. Owner/manager only.

async function requireManager() {
  const ctx = await getTenantContext()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!(["owner", "manager"] as Role[]).includes(ctx.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ctx }
}

// GET — department breakdown for the wizard: catalog total + already-seeded per category.
export async function GET() {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r

  const [byCat, seededByCat] = await Promise.all([
    dbAdmin().select({ category: drug_catalog.category, total: sql<number>`count(*)::int` })
      .from(drug_catalog).where(isNotNull(drug_catalog.category)).groupBy(drug_catalog.category),
    dbAdmin().select({ category: drug_catalog.category, seeded: sql<number>`count(*)::int` })
      .from(product).innerJoin(drug_catalog, eq(drug_catalog.id, product.catalog_id))
      .where(eq(product.organization_id, ctx.organizationId)).groupBy(drug_catalog.category),
  ])

  const seededMap = new Map(seededByCat.map((s) => [s.category, s.seeded]))
  const departments = byCat
    .map((c) => ({ category: c.category!, total: c.total, seeded: seededMap.get(c.category) ?? 0 }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    departments,
    catalogTotal: departments.reduce((n, d) => n + d.total, 0),
    seeded: departments.reduce((n, d) => n + d.seeded, 0),
  })
}

const seedBody = z.object({
  categories: z.array(z.string()).optional(), // omit/empty => all departments
}).optional()

// POST — seed selected departments (or all). Idempotent: inserts products that
// aren't seeded yet; for previously-seeded-but-unpriced rows (old inactive flow)
// it back-fills price + category + activates, without clobbering tenant edits.
export async function POST(request: NextRequest) {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r

  const parsed = seedBody.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  const wantCats = parsed.data?.categories?.filter(Boolean) ?? []

  const catalogRows = await dbAdmin().select().from(drug_catalog).where(
    wantCats.length ? inArray(drug_catalog.category, wantCats) : isNotNull(drug_catalog.category),
  )
  if (catalogRows.length === 0) return NextResponse.json({ seeded: 0, updated: 0, alreadyPresent: 0 })

  const result = await withTenant(ctx.organizationId, async (db) => {
    // Materialise a two-level taxonomy for this org: top-level departments
    // (parent_id NULL) and their subcategories (parent_id = department). Products
    // link to the leaf (subcategory) when present, else the department. Idempotent.
    const existingCats = await db.select({ id: category.id, name: category.name, parent_id: category.parent_id }).from(category)
    const parentByName = new Map(existingCats.filter((c) => !c.parent_id).map((c) => [c.name, c.id]))
    const childKey = (pid: string, name: string) => `${pid}::${name}`
    const childByKey = new Map(existingCats.filter((c) => c.parent_id).map((c) => [childKey(c.parent_id!, c.name), c.id]))

    // 1. departments
    const wantParents = [...new Set(catalogRows.map((c) => c.category).filter(Boolean) as string[])]
    const missingParents = wantParents.filter((n) => !parentByName.has(n))
    if (missingParents.length) {
      const inserted = await db.insert(category)
        .values(missingParents.map((name) => ({ organization_id: ctx.organizationId, name })))
        .returning({ id: category.id, name: category.name })
      for (const c of inserted) parentByName.set(c.name, c.id)
    }
    // 2. subcategories (unique per department)
    const wantChildren = [...new Map(
      catalogRows.filter((c) => c.category && c.subcategory)
        .map((c) => [`${c.category}::${c.subcategory}`, { parent: c.category!, name: c.subcategory! }]),
    ).values()]
    const missingChildren = wantChildren.filter((ch) => {
      const pid = parentByName.get(ch.parent); return pid && !childByKey.has(childKey(pid, ch.name))
    })
    if (missingChildren.length) {
      const inserted = await db.insert(category)
        .values(missingChildren.map((ch) => ({ organization_id: ctx.organizationId, name: ch.name, parent_id: parentByName.get(ch.parent)! })))
        .returning({ id: category.id, name: category.name, parent_id: category.parent_id })
      for (const c of inserted) childByKey.set(childKey(c.parent_id!, c.name), c.id)
    }
    // Resolve a catalog row to its leaf category id.
    const catIdFor = (c: typeof catalogRows[number]): string | null => {
      const pid = c.category ? parentByName.get(c.category) ?? null : null
      if (c.category && c.subcategory && pid) return childByKey.get(childKey(pid, c.subcategory)) ?? pid
      return pid
    }

    // Split catalog into new vs already-seeded.
    const seeded = await db.select({ catalog_id: product.catalog_id, id: product.id, selling_price: product.selling_price })
      .from(product).where(isNotNull(product.catalog_id))
    const seededByCat = new Map(seeded.map((s) => [s.catalog_id, s]))

    const toInsert = catalogRows.filter((c) => !seededByCat.has(c.id)).map((c) => ({
      organization_id: ctx.organizationId,
      created_by: ctx.userId,
      catalog_id: c.id,
      category_id: catIdFor(c),
      name: c.name,
      brand_name: c.brand_name,
      manufacturer: c.manufacturer,
      gtin: c.gtin,
      strength: c.strength,
      dosage_form: c.dosage_form,
      base_unit: c.base_unit,
      pack_label: c.default_pack_label,
      units_per_pack: c.default_units_per_pack ?? 1,
      cost_price: c.default_cost_price,
      selling_price: c.default_selling_price ?? "0",
      reorder_level: 3, // sensible low-stock default for seeded products
      is_controlled: c.is_controlled,
      requires_prescription: c.requires_prescription,
      is_active: true,
    }))
    if (toInsert.length) await db.insert(product).values(toInsert)

    // Back-fill the legacy inactive/unpriced rows so re-running Quick Start fixes them.
    let updated = 0
    const fixable = catalogRows
      .map((c) => ({ c, p: seededByCat.get(c.id) }))
      .filter((x) => x.p && Number(x.p!.selling_price) === 0 && Number(x.c.default_selling_price) > 0)
    for (const { c, p } of fixable) {
      await db.update(product).set({
        is_active: true,
        selling_price: c.default_selling_price!,
        cost_price: c.default_cost_price,
        pack_label: c.default_pack_label,
        units_per_pack: c.default_units_per_pack ?? 1,
        reorder_level: 3,
        category_id: catIdFor(c),
        updated_at: new Date(),
      }).where(eq(product.id, p!.id))
      updated++
    }

    return { seeded: toInsert.length, updated, alreadyPresent: seededByCat.size }
  })

  return NextResponse.json(result)
}

// DELETE — unseed: remove seeded products that have never been batched or sold.
export async function DELETE() {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r

  const result = await withTenant(ctx.organizationId, async (db) => {
    const seeded = await db.select({ id: product.id }).from(product).where(isNotNull(product.catalog_id))
    const ids = seeded.map((p) => p.id)
    if (ids.length === 0) return { removed: 0, kept: 0 }
    const [batched, sold] = await Promise.all([
      db.select({ pid: product_batch.product_id }).from(product_batch).where(inArray(product_batch.product_id, ids)),
      db.select({ pid: sale_item.product_id }).from(sale_item).where(inArray(sale_item.product_id, ids)),
    ])
    const touched = new Set<string>([...batched.map((b) => b.pid), ...sold.map((s) => s.pid).filter(Boolean) as string[]])
    const removable = ids.filter((id) => !touched.has(id))
    if (removable.length) await db.delete(product).where(inArray(product.id, removable))
    return { removed: removable.length, kept: ids.length - removable.length }
  })
  return NextResponse.json(result)
}
