import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, eq, ne, or } from "drizzle-orm"
import { withTenant, product, product_pack_size } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { serializePackSize } from "@/lib/products/packsize"
import { redis } from "@/lib/redis"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  brand_name: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  gtin: z.string().nullable().optional(),
  barcode_raw: z.string().nullable().optional(),
  strength: z.string().nullable().optional(),
  dosage_form: z.string().nullable().optional(),
  category_id: zUuid().nullable().optional(),
  supplier_id: zUuid().nullable().optional(),
  base_unit: z.string().min(1).optional(),
  pack_label: z.string().nullable().optional(),
  units_per_pack: z.number().int().positive().optional(),
  cost_price: z.number().nonnegative().nullable().optional(),
  selling_price: z.number().positive().optional(),
  reorder_level: z.number().int().nonnegative().optional(),
  is_controlled: z.boolean().optional(),
  requires_prescription: z.boolean().optional(),
  image_url: z.string().nullable().optional(),
  max_discount_percent: z.number().min(0).max(100).nullable().optional(),
  is_active: z.boolean().optional(),
})

const num = (v: string | number | null) => (v == null ? null : Number(v))
function serialize(p: typeof product.$inferSelect) {
  return { ...p, selling_price: num(p.selling_price), cost_price: num(p.cost_price), max_discount_percent: num(p.max_discount_percent) }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return withTenant(ctx, async (db) => {
    const [p] = await db.select().from(product).where(eq(product.id, id)).limit(1)
    if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 })
    const packSizes = await db.select().from(product_pack_size)
      .where(eq(product_pack_size.product_id, id)).orderBy(asc(product_pack_size.unit_count))
    return NextResponse.json({ product: serialize(p), packSizes: packSizes.map(serializePackSize) })
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(["owner", "manager", "pharmacist"] as Role[]).includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ gtin: product.gtin, barcode_raw: product.barcode_raw }).from(product).where(eq(product.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Product not found" } }

    const nextGtin = parsed.data.gtin !== undefined ? parsed.data.gtin : existing.gtin
    const nextRaw = parsed.data.barcode_raw !== undefined ? parsed.data.barcode_raw : existing.barcode_raw
    if (nextGtin || nextRaw) {
      const conflictConds = [nextGtin ? eq(product.gtin, nextGtin) : undefined, nextRaw ? eq(product.barcode_raw, nextRaw) : undefined].filter(Boolean)
      const [conflict] = await db.select({ id: product.id, name: product.name }).from(product)
        .where(and(ne(product.id, id), eq(product.organization_id, ctx.organizationId), or(...conflictConds)))
        .limit(1)
      if (conflict) return { status: 409 as const, body: { error: `That barcode is already assigned to "${conflict.name}"` } }
    }

    const { cost_price, selling_price, max_discount_percent, ...rest } = parsed.data
    const [updated] = await db.update(product).set({
      ...rest,
      ...(cost_price !== undefined && { cost_price: cost_price == null ? null : String(cost_price) }),
      ...(selling_price !== undefined && { selling_price: String(selling_price) }),
      ...(max_discount_percent !== undefined && { max_discount_percent: max_discount_percent == null ? null : String(max_discount_percent) }),
      updated_at: new Date(),
    }).where(and(eq(product.id, id), eq(product.organization_id, ctx.organizationId))).returning()

    return { status: 200 as const, body: { product: serialize(updated!) }, gtin: parsed.data.gtin ?? existing.gtin, raw: parsed.data.barcode_raw ?? existing.barcode_raw }
  })

  if (out.status === 200 && redis) {
    try {
      if (out.gtin) await redis.del(`product:${ctx.organizationId}:${out.gtin}`)
      if (out.raw) await redis.del(`product:${ctx.organizationId}:${out.raw}`)
    } catch {}
  }
  return NextResponse.json(out.body, { status: out.status })
}
