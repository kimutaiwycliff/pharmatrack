import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { asc, eq } from "drizzle-orm"
import { withTenant, product, product_pack_size } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { serializePackSize } from "@/lib/products/packsize"

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
  if (!(["owner", "manager", "pharmacist"] as Role[]).includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = packSizeSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    // Confirm the product is in this org (RLS already scopes, this gives a 404).
    const [p] = await db.select({ id: product.id }).from(product).where(eq(product.id, id)).limit(1)
    if (!p) return { status: 404 as const, body: { error: "Product not found" } }
    const [row] = await db.insert(product_pack_size).values({
      product_id: id, label: parsed.data.pack_label,
      unit_count: parsed.data.units_per_pack, selling_price: String(parsed.data.selling_price),
    }).returning()
    return { status: 201 as const, body: { packSize: serializePackSize(row!) } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
