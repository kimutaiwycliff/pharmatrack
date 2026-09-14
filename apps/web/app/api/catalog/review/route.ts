import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNotNull, asc } from "drizzle-orm"
import { withTenant, product, product_batch, product_stock } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription, type Role } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { z } from "zod"

// Review grid for Quick Start: list the catalog-seeded products for a branch with
// their current price + stock, and bulk-edit cost/selling price, active flag and
// opening quantity. Opening qty is held in a single per-(product,branch) "OPENING"
// batch so editing the number adjusts that batch rather than stacking duplicates.
// Owner/manager only.

const OPENING_BATCH = "OPENING"
function openingExpiry(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 2) // sensible placeholder; refine in batch mgmt
  return d.toISOString().slice(0, 10)
}

async function requireManager() {
  const ctx = await getTenantContext()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!(["owner", "manager"] as Role[]).includes(ctx.role)) {
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

  const products = rows.map((p) => ({
    product_id: p.product_id, name: p.name, brand_name: p.brand_name, strength: p.strength,
    base_unit: p.base_unit, pack_label: p.pack_label, units_per_pack: p.units_per_pack,
    category_id: p.category_id, is_active: p.is_active,
    cost_price: num(p.cost_price), selling_price: num(p.selling_price),
    stock_on_hand: p.stock_on_hand ?? 0,
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

  const result = await withTenant(ctx, async (db) => {
    let priced = 0, stocked = 0
    for (const it of items) {
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
            .set({ quantity_received: it.opening_qty, quantity_remaining: it.opening_qty })
            .where(eq(product_batch.id, existing.id))
        } else if (it.opening_qty > 0) {
          await db.insert(product_batch).values({
            organization_id: ctx.organizationId, product_id: it.id, branch_id,
            batch_number: OPENING_BATCH, expiry_date: openingExpiry(),
            quantity_received: it.opening_qty, quantity_remaining: it.opening_qty,
            cost_price: it.cost_price != null ? String(it.cost_price) : null,
            received_by: ctx.userId,
          })
        }
        stocked++
      }
    }
    return { priced, stocked }
  })

  return NextResponse.json(result)
}
