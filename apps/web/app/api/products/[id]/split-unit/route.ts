import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, inArray, sql } from "drizzle-orm"
import { withTenant, product, product_batch, product_pack_size, stock_adjustment, audit_log } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { invalidateBarcodeCache } from "@/lib/products/barcodeCache"

// "Sell in smaller units": re-base a product onto a smaller unit, e.g. a strip
// (KES 50) → 10 capsules (KES 5 each), so loose units can be sold and "KES 20
// worth" becomes 4 capsules instead of an untrue fraction of a strip.
// Everything stored in base units is multiplied by `factor` (batch quantities,
// adjustment history, pack sizes, reorder level); per-unit prices are divided.
// The old unit is kept as a pack size at its exact old price, so it can still
// be sold whole without rounding.
const schema = z.object({
  new_base_unit: z.string().trim().min(1).max(40),
  factor: z.number().int().min(2).max(1000),
})

const div = (v: string | null, factor: number) =>
  v == null ? null : (Math.round((Number(v) / factor) * 100) / 100).toFixed(2)

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "products.edit" })
  if ("error" in ctx) return ctx.error
  // Batches in other branches would be invisible to a branch-locked session
  // and left in the old unit — require the org-wide view.
  if (ctx.branchLocked) {
    return NextResponse.json({ error: "Changing units needs access to all branches." }, { status: 403 })
  }
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { new_base_unit, factor } = parsed.data

  const out = await withTenant(ctx, async (db) => {
    const [p] = await db.select().from(product).where(eq(product.id, id)).limit(1)
    if (!p) return { status: 404 as const, body: { error: "Product not found" } }
    if (p.is_controlled) {
      // The PPB register records dispensed quantities in the old unit; mixing
      // units there would make it unreadable.
      return { status: 409 as const, body: { error: "Controlled substances can't change unit — the PPB register would mix units." } }
    }
    if (new_base_unit.toLowerCase() === p.base_unit.toLowerCase()) {
      return { status: 400 as const, body: { error: "Pick a different, smaller unit" } }
    }

    const oldUnit = p.base_unit
    await db.update(product).set({
      base_unit: new_base_unit,
      selling_price: div(p.selling_price, factor)!,
      cost_price: div(p.cost_price, factor),
      units_per_pack: p.units_per_pack * factor,
      reorder_level: p.reorder_level * factor,
    }).where(eq(product.id, id))

    const batches = await db.select({ id: product_batch.id }).from(product_batch).where(eq(product_batch.product_id, id))
    const batchIds = batches.map((b) => b.id)
    if (batchIds.length > 0) {
      await db.update(product_batch).set({
        quantity_received: sql`${product_batch.quantity_received} * ${factor}`,
        quantity_remaining: sql`${product_batch.quantity_remaining} * ${factor}`,
        cost_price: sql`round(${product_batch.cost_price} / ${factor}, 2)`,
      }).where(eq(product_batch.product_id, id))
      await db.update(stock_adjustment).set({
        delta: sql`${stock_adjustment.delta} * ${factor}`,
        quantity_before: sql`${stock_adjustment.quantity_before} * ${factor}`,
        quantity_after: sql`${stock_adjustment.quantity_after} * ${factor}`,
      }).where(inArray(stock_adjustment.batch_id, batchIds))
    }

    await db.update(product_pack_size).set({ unit_count: sql`${product_pack_size.unit_count} * ${factor}` })
      .where(eq(product_pack_size.product_id, id))
    const packs = await db.select({ unit_count: product_pack_size.unit_count }).from(product_pack_size)
      .where(eq(product_pack_size.product_id, id))
    if (!packs.some((pk) => pk.unit_count === factor)) {
      await db.insert(product_pack_size).values({
        product_id: id,
        label: `${oldUnit.charAt(0).toUpperCase()}${oldUnit.slice(1)} of ${factor}`,
        unit_count: factor,
        selling_price: p.selling_price,
        cost_price: p.cost_price,
      })
    }

    await db.insert(audit_log).values({
      organization_id: ctx.organizationId, actor_id: ctx.userId, action: "product.split_unit",
      entity: "product", entity_id: id,
      diff: { from_unit: oldUnit, to_unit: new_base_unit, factor, old_selling_price: p.selling_price, old_cost_price: p.cost_price },
    })
    return {
      status: 200 as const,
      body: { ok: true, base_unit: new_base_unit, selling_price: Number(div(p.selling_price, factor)) },
      barcodes: [p.gtin, p.barcode_raw].filter((b): b is string => !!b),
    }
  })
  // Barcode lookups are cached with the old unit/price.
  if (out.status === 200) await invalidateBarcodeCache(ctx.organizationId, out.barcodes)
  return NextResponse.json(out.body, { status: out.status })
}
