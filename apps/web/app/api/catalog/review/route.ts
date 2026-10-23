import { NextRequest, NextResponse } from "next/server"
import { and, asc, eq, inArray } from "drizzle-orm"
import { withTenant, product } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { canViewCost } from "@/lib/auth/costVisibility"
import { zUuid } from "@/lib/api/validation"
import { z } from "zod"

// Quick Start → Prices: list the products Quick Start added (or just the ones
// added a moment ago, ?ids=) and bulk-set pack size, cost and selling price.
// Prices only — stock is loaded by a stock take (Receive, or a count sheet
// import) with real batch numbers and expiry dates. Owner/manager.

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
const idsSchema = z.array(zUuid()).max(2000)

// GET ?ids=a,b — Quick Start products (those ids only, when given), unpriced first.
export async function GET(request: NextRequest) {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r
  const raw = new URL(request.url).searchParams.get("ids")
  const ids = idsSchema.safeParse(raw ? raw.split(",").filter(Boolean) : [])
  if (!ids.success) return NextResponse.json({ error: "Invalid ids" }, { status: 400 })

  const rows = await withTenant(ctx, (db) =>
    db.select({
      product_id: product.id, name: product.name, brand_name: product.brand_name, strength: product.strength,
      dosage_form: product.dosage_form, base_unit: product.base_unit, pack_label: product.pack_label,
      units_per_pack: product.units_per_pack, is_active: product.is_active, cost_price: product.cost_price, selling_price: product.selling_price,
    }).from(product)
      .where(ids.data.length ? inArray(product.id, ids.data) : eq(product.quick_start, true))
      .orderBy(asc(product.name)),
  )
  const showCost = canViewCost(ctx)
  const products = rows
    .map((p) => ({ ...p, cost_price: showCost ? num(p.cost_price) : null, selling_price: num(p.selling_price) }))
    .sort((a, b) => Number((a.selling_price ?? 0) > 0) - Number((b.selling_price ?? 0) > 0))
  return NextResponse.json({ products, can_edit_cost: showCost })
}

const patchBody = z.object({
  items: z.array(z.object({
    id: zUuid(),
    units_per_pack: z.number().int().positive().max(10000).optional(),
    // Per unit (the grid converts from cost per pack).
    cost_price: z.number().nonnegative().nullable().optional(),
    selling_price: z.number().nonnegative().optional(),
    is_active: z.boolean().optional(),
  })).min(1).max(2000),
})

// PATCH — bulk apply pack size / prices. A product goes on sale only with a price.
export async function PATCH(request: NextRequest) {
  const r = await requireManager()
  if ("error" in r) return r.error
  const { ctx } = r
  const parsed = patchBody.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 })
  const { items } = parsed.data
  const showCost = canViewCost(ctx)

  const result = await withTenant(ctx, async (db) => {
    const current = await db.select({ id: product.id, name: product.name, selling_price: product.selling_price })
      .from(product).where(inArray(product.id, items.map((i) => i.id)))
    const byId = new Map(current.map((c) => [c.id, c]))
    for (const it of items) {
      const row = byId.get(it.id)
      if (!row) continue
      const finalPrice = it.selling_price ?? Number(row.selling_price ?? 0)
      // Never switch a product on at KES 0.
      if (it.is_active === true && !(finalPrice > 0)) return { error: `${row.name} needs a selling price before it can be sold.` }
    }
    let priced = 0
    for (const it of items) {
      if (!byId.has(it.id)) continue
      const set: Record<string, unknown> = { updated_at: new Date() }
      if (it.units_per_pack !== undefined) set.units_per_pack = it.units_per_pack
      if (it.selling_price !== undefined) set.selling_price = String(it.selling_price)
      if (showCost && it.cost_price !== undefined) set.cost_price = it.cost_price === null ? null : String(it.cost_price)
      if (it.is_active !== undefined) set.is_active = it.is_active
      if (Object.keys(set).length > 1) {
        await db.update(product).set(set).where(and(eq(product.id, it.id), eq(product.organization_id, ctx.organizationId)))
        priced++
      }
    }
    return { priced }
  })

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
