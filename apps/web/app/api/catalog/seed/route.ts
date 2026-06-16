import { NextResponse } from "next/server"
import { and, eq, isNotNull, inArray, sql } from "drizzle-orm"
import { dbAdmin, withTenant, drug_catalog, product, product_batch, sale_item } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"

// Materialise the shared drug_catalog into an org's products (and reverse it).
// Seeded rows are tagged with products.catalog_id. Owner/manager only.

async function requireManager() {
  const ctx = await getTenantContext()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!(["owner", "manager"] as Role[]).includes(ctx.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ctx }
}

export async function GET() {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r
  const catRows = await dbAdmin().select({ n: sql<number>`count(*)::int` }).from(drug_catalog)
  const seeded = await withTenant(ctx.organizationId, (db) =>
    db.select({ n: sql<number>`count(*)::int` }).from(product).where(isNotNull(product.catalog_id)),
  )
  return NextResponse.json({ catalogTotal: catRows[0]?.n ?? 0, seeded: seeded[0]?.n ?? 0 })
}

export async function POST() {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r

  const catalog = await dbAdmin().select().from(drug_catalog)
  const result = await withTenant(ctx.organizationId, async (db) => {
    const existing = await db.select({ catalog_id: product.catalog_id }).from(product).where(isNotNull(product.catalog_id))
    const seededIds = new Set(existing.map((e) => e.catalog_id))
    const toInsert = catalog.filter((c) => !seededIds.has(c.id)).map((c) => ({
      organization_id: ctx.organizationId,
      created_by: ctx.userId,
      catalog_id: c.id,
      name: c.name,
      brand_name: c.brand_name,
      manufacturer: c.manufacturer,
      gtin: c.gtin,
      strength: c.strength,
      dosage_form: c.dosage_form,
      base_unit: c.base_unit,
      is_controlled: c.is_controlled,
      requires_prescription: c.requires_prescription,
      selling_price: "0",
      is_active: false,
    }))
    if (toInsert.length) await db.insert(product).values(toInsert)
    return { seeded: toInsert.length, alreadyPresent: seededIds.size }
  })
  return NextResponse.json(result)
}

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
