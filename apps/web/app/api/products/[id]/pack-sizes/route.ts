import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { asc, eq } from "drizzle-orm"
import { withTenant, product, product_pack_size } from "@pharmatrack/db"
import { generateInternalBarcode } from "@pharmatrack/core"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { serializePackSize } from "@/lib/products/packsize"
import { findBarcodeConflict } from "@/lib/products/barcodeConflict"

const MAX_BARCODE_GENERATION_ATTEMPTS = 5

const packSizeSchema = z.object({
  pack_label: z.string().min(1),
  units_per_pack: z.number().int().positive(),
  selling_price: z.number().positive(),
  barcode: z.string().nullable().optional(),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  return withTenant(ctx, async (db) => {
    const rows = await db.select().from(product_pack_size)
      .where(eq(product_pack_size.product_id, id)).orderBy(asc(product_pack_size.unit_count))
    return NextResponse.json({ packSizes: rows.map(serializePackSize) })
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!(["owner", "manager", "pharmacist"] as Role[]).includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = packSizeSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    // Confirm the product is in this org (RLS already scopes, this gives a 404).
    const [p] = await db.select({ id: product.id }).from(product).where(eq(product.id, id)).limit(1)
    if (!p) return { status: 404 as const, body: { error: "Product not found" } }

    let barcode = parsed.data.barcode || null
    if (barcode) {
      const conflictName = await findBarcodeConflict(db, ctx.organizationId, [barcode])
      if (conflictName) return { status: 409 as const, body: { error: `That barcode is already assigned to "${conflictName}"` } }
    } else {
      // No barcode supplied — generate an internal one so this pack size
      // (e.g. a box vs. a strip of the same product) is still scannable.
      for (let attempt = 0; attempt < MAX_BARCODE_GENERATION_ATTEMPTS; attempt++) {
        const candidate = generateInternalBarcode()
        const conflict = await findBarcodeConflict(db, ctx.organizationId, [candidate])
        if (!conflict) {
          barcode = candidate
          break
        }
      }
    }

    const [row] = await db.insert(product_pack_size).values({
      product_id: id, label: parsed.data.pack_label,
      unit_count: parsed.data.units_per_pack, selling_price: String(parsed.data.selling_price),
      barcode,
    }).returning()
    return { status: 201 as const, body: { packSize: serializePackSize(row!) } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
