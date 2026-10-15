import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray, isNotNull, asc } from "drizzle-orm"
import { withTenant, product, product_batch, product_stock } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { z } from "zod"

// Review grid for Quick Start: list the catalog-seeded products for a branch with
// their current price + stock, and bulk-edit cost/selling price, active flag and
// opening quantity. Opening qty is held in a single per-(product,branch) "OPENING"
// batch so editing the number adjusts that batch rather than stacking duplicates.
// Owner/manager only.

const OPENING_BATCH = "OPENING"

async function requireManager() {
  const ctx = await getTenantContext()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!ctx.permissions.includes("catalog.seed")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return { error: subErr }
  return { ctx }
}

const num = (v: string | number | null) => (v == null ? null : Number(v))

// GET ?branch_id= — seeded products for the branch with price + on-hand stock.
export async function GET(request: NextRequest) {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r
  const branchId = new URL(request.url).searchParams.get("branch_id")
  if (!branchId) return NextResponse.json({ error: "branch_id required" }, { status: 400 })

  const rows = await withTenant(ctx, (db) =>
    db.select().from(product_stock)
      .where(and(eq(product_stock.branch_id, branchId), isNotNull(product_stock.catalog_id)))
      .orderBy(asc(product_stock.name)),
  )

  // Expiry of each product's opening-stock batch, so the grid can show/edit it.
  const ids = rows.map((r) => r.product_id).filter((id): id is string => !!id)
  const opening = ids.length
    ? await withTenant(ctx, (db) =>
        db.select({ product_id: product_batch.product_id, expiry_date: product_batch.expiry_date }).from(product_batch)
          .where(and(inArray(product_batch.product_id, ids), eq(product_batch.branch_id, branchId), eq(product_batch.batch_number, OPENING_BATCH))),
      )
    : []
  const openingExpiry = new Map(opening.map((o) => [o.product_id, o.expiry_date]))

  const products = rows.map((p) => ({
    product_id: p.product_id, name: p.name, brand_name: p.brand_name, strength: p.strength,
    base_unit: p.base_unit, pack_label: p.pack_label, units_per_pack: p.units_per_pack,
    category_id: p.category_id, is_active: p.is_active,
    cost_price: num(p.cost_price), selling_price: num(p.selling_price),
    stock_on_hand: p.stock_on_hand ?? 0,
    opening_expiry: (p.product_id && openingExpiry.get(p.product_id)) ?? null,
  }))
  return NextResponse.json({ products })
}

const patchBody = z.object({
  branch_id: zUuid(),
  items: z.array(z.object({
    id: zUuid(),
    cost_price: z.number().nonnegative().nullable().optional(),
    selling_price: z.number().nonnegative().optional(),
    is_active: z.boolean().optional(),
    opening_qty: z.number().int().nonnegative().optional(),
    // Real expiry of the opening stock (YYYY-MM-DD) — required when adding
    // opening stock; it used to be invented as "today + 2 years".
    expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).min(1).max(2000),
})

// PATCH — bulk apply price/active edits and opening quantities.
export async function PATCH(request: NextRequest) {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r

  const parsed = patchBody.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  const { branch_id, items } = parsed.data

  class ReviewError extends Error {}
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date())

  const result = await withTenant(ctx, async (db) => {
    const current = await db.select({ id: product.id, name: product.name, selling_price: product.selling_price })
      .from(product).where(inArray(product.id, items.map((i) => i.id)))
    const byId = new Map(current.map((c) => [c.id, c]))
    let priced = 0, stocked = 0
    for (const it of items) {
      const existingRow = byId.get(it.id)
      const finalPrice = it.selling_price ?? Number(existingRow?.selling_price ?? 0)
      // Never switch a product on at KES 0.
      if (it.is_active === true && !(finalPrice > 0)) {
        throw new ReviewError(`${existingRow?.name ?? "A product"} needs a selling price before it can be sold.`)
      }
      if (it.expiry_date && it.expiry_date <= today) {
        throw new ReviewError(`The expiry date for ${existingRow?.name ?? "a product"}'s opening stock has already passed.`)
      }
      const set: Record<string, unknown> = { updated_at: new Date() }
      if (it.selling_price !== undefined) set.selling_price = String(it.selling_price)
      if (it.cost_price !== undefined) set.cost_price = it.cost_price === null ? null : String(it.cost_price)
      if (it.is_active !== undefined) set.is_active = it.is_active
      if (Object.keys(set).length > 1) { await db.update(product).set(set).where(eq(product.id, it.id)); priced++ }

      if (it.opening_qty !== undefined) {
        const [existing] = await db.select({ id: product_batch.id }).from(product_batch)
          .where(and(eq(product_batch.product_id, it.id), eq(product_batch.branch_id, branch_id), eq(product_batch.batch_number, OPENING_BATCH)))
          .limit(1)
        if (existing) {
          await db.update(product_batch)
            .set({ quantity_received: it.opening_qty, quantity_remaining: it.opening_qty, ...(it.expiry_date ? { expiry_date: it.expiry_date } : {}) })
            .where(eq(product_batch.id, existing.id))
        } else if (it.opening_qty > 0) {
          if (!it.expiry_date) throw new ReviewError(`Enter the expiry date for ${existingRow?.name ?? "each product"}'s opening stock.`)
          await db.insert(product_batch).values({
            organization_id: ctx.organizationId, product_id: it.id, branch_id,
            batch_number: OPENING_BATCH, expiry_date: it.expiry_date,
            quantity_received: it.opening_qty, quantity_remaining: it.opening_qty,
            cost_price: it.cost_price != null ? String(it.cost_price) : null,
            received_by: ctx.userId,
          })
        }
        stocked++
      }
    }
    return { priced, stocked }
  }).catch((err: unknown) => {
    if (err instanceof ReviewError) return { error: err.message }
    throw err
  })

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
