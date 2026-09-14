import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { withTenant, product_pack_size } from "@pharmatrack/db"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { serializePackSize } from "@/lib/products/packsize"
import { findBarcodeConflict } from "@/lib/products/barcodeConflict"

const updateSchema = z.object({
  pack_label: z.string().min(1).optional(),
  units_per_pack: z.number().int().positive().optional(),
  selling_price: z.number().positive().optional(),
  barcode: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

function canWrite(role: Role) {
  return (["owner", "manager", "pharmacist"] as Role[]).includes(role)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; sizeId: string }> }) {
  const { sizeId } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!canWrite(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const set: Partial<typeof product_pack_size.$inferInsert> = {}
  if (parsed.data.pack_label !== undefined) set.label = parsed.data.pack_label
  if (parsed.data.units_per_pack !== undefined) set.unit_count = parsed.data.units_per_pack
  if (parsed.data.selling_price !== undefined) set.selling_price = String(parsed.data.selling_price)
  if (parsed.data.barcode !== undefined) set.barcode = parsed.data.barcode
  if (parsed.data.is_active !== undefined) set.is_active = parsed.data.is_active

  const out = await withTenant(ctx, async (db) => {
    if (Object.keys(set).length === 0) {
      const [row] = await db.select().from(product_pack_size).where(eq(product_pack_size.id, sizeId)).limit(1)
      if (!row) return { status: 404 as const, body: { error: "Pack size not found" } }
      return { status: 200 as const, body: { packSize: serializePackSize(row) } }
    }

    if (set.barcode) {
      const conflictName = await findBarcodeConflict(db, ctx.organizationId, [set.barcode], { packSizeId: sizeId })
      if (conflictName) return { status: 409 as const, body: { error: `That barcode is already assigned to "${conflictName}"` } }
    }

    const [row] = await db.update(product_pack_size).set(set).where(eq(product_pack_size.id, sizeId)).returning()
    if (!row) return { status: 404 as const, body: { error: "Pack size not found" } }
    return { status: 200 as const, body: { packSize: serializePackSize(row) } }
  })
  return NextResponse.json(out.body, { status: out.status })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; sizeId: string }> }) {
  const { sizeId } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!canWrite(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await withTenant(ctx, (db) => db.delete(product_pack_size).where(eq(product_pack_size.id, sizeId)))
  return NextResponse.json({ success: true })
}
