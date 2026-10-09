import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, eq } from "drizzle-orm"
import { withTenant, product, product_pack_size, audit_log } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { canViewCost, omitCost } from "@/lib/auth/costVisibility"
import { zUuid } from "@/lib/api/validation"
import { serializePackSize } from "@/lib/products/packsize"
import { findBarcodeConflict } from "@/lib/products/barcodeConflict"
import { invalidateBarcodeCache } from "@/lib/products/barcodeCache"
import { forbidden } from "@/lib/api-auth"
import { getDeleteImpact, purgeProduct } from "@/lib/products/permanentDelete"


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
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  return withTenant(ctx, async (db) => {
    const [p] = await db.select().from(product).where(eq(product.id, id)).limit(1)
    if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 })
    const packSizes = await db.select().from(product_pack_size)
      .where(eq(product_pack_size.product_id, id)).orderBy(asc(product_pack_size.unit_count))
    const out = serialize(p)
    return NextResponse.json({ product: canViewCost(ctx) ? out : omitCost(out), packSizes: packSizes.map(serializePackSize) })
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!ctx.permissions.includes("products.edit")) return forbidden("products.edit")

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  // Pharmacist/cashier can't view cost — don't let a direct API call set it either.
  if (!canViewCost(ctx)) parsed.data.cost_price = undefined

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ gtin: product.gtin, barcode_raw: product.barcode_raw }).from(product).where(eq(product.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Product not found" } }

    const nextGtin = parsed.data.gtin !== undefined ? parsed.data.gtin : existing.gtin
    const nextRaw = parsed.data.barcode_raw !== undefined ? parsed.data.barcode_raw : existing.barcode_raw
    const conflictName = await findBarcodeConflict(db, ctx.organizationId, [nextGtin, nextRaw], { productId: id })
    if (conflictName) return { status: 409 as const, body: { error: `That barcode is already assigned to "${conflictName}"` } }

    const { cost_price, selling_price, max_discount_percent, ...rest } = parsed.data
    const [updated] = await db.update(product).set({
      ...rest,
      ...(cost_price !== undefined && { cost_price: cost_price == null ? null : String(cost_price) }),
      ...(selling_price !== undefined && { selling_price: String(selling_price) }),
      ...(max_discount_percent !== undefined && { max_discount_percent: max_discount_percent == null ? null : String(max_discount_percent) }),
      updated_at: new Date(),
    }).where(and(eq(product.id, id), eq(product.organization_id, ctx.organizationId))).returning()

    const serialized = serialize(updated!)
    return {
      status: 200 as const,
      body: { product: canViewCost(ctx) ? serialized : omitCost(serialized) },
      gtin: parsed.data.gtin ?? existing.gtin, raw: parsed.data.barcode_raw ?? existing.barcode_raw,
    }
  })

  if (out.status === 200) await invalidateBarcodeCache(ctx.organizationId, [out.gtin, out.raw])
  return NextResponse.json(out.body, { status: out.status })
}

const permanentSchema = z.object({ confirm_name: z.string().min(1) })

/**
 * DELETE /api/products/:id            — delete a product that was never used
 *                                       (409 with an impact summary otherwise)
 * DELETE /api/products/:id?permanent=1 — erase it with its history
 *   body { confirm_name } must match the product name (typed confirmation).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!ctx.permissions.includes("products.delete")) return forbidden("products.delete")

  const permanent = new URL(request.url).searchParams.get("permanent") === "1"
  let confirmName: string | null = null
  if (permanent) {
    if (!ctx.permissions.includes("products.delete_permanent")) return forbidden("products.delete_permanent")
    // Batches/sales in other branches would be invisible to a branch-locked
    // session, leaving FK references behind — require the org-wide view.
    if (ctx.branchLocked) {
      return NextResponse.json({ error: "Permanent delete needs access to all branches." }, { status: 403 })
    }
    const parsed = permanentSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: "Type the product name to confirm" }, { status: 400 })
    confirmName = parsed.data.confirm_name
  }

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ id: product.id, name: product.name, gtin: product.gtin, barcode_raw: product.barcode_raw })
      .from(product).where(eq(product.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Product not found" } }

    if (permanent) {
      if (confirmName!.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
        return { status: 400 as const, body: { error: "The name you typed doesn't match this product" } }
      }
      const gone = await purgeProduct(db, { organizationId: ctx.organizationId, actorId: ctx.userId, productId: id })
      if (!gone) return { status: 404 as const, body: { error: "Product not found" } }
      return { status: 200 as const, body: { ok: true, permanent: true }, gtin: gone.gtin, raw: gone.barcode_raw }
    }

    // A plain delete would cascade-remove batches (losing receipt/stock history)
    // and fail against any sale referencing it — so refuse with the impact, and
    // let the client offer Deactivate or (with permission) Delete permanently.
    const impact = await getDeleteImpact(db, id)
    if (!impact.clean) {
      return { status: 409 as const, body: { error: "This product has stock or sales history — deactivate it, or delete it permanently.", impact } }
    }

    await db.delete(product).where(eq(product.id, id))
    await db.insert(audit_log).values({
      organization_id: ctx.organizationId, actor_id: ctx.userId, action: "product.delete",
      entity: "product", entity_id: id, diff: { name: existing.name },
    })
    return { status: 200 as const, body: { ok: true }, gtin: existing.gtin, raw: existing.barcode_raw }
  })

  if (out.status === 200) await invalidateBarcodeCache(ctx.organizationId, [out.gtin, out.raw])
  return NextResponse.json(out.body, { status: out.status })
}
