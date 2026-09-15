import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, or, ilike, asc, sql, eq, isNull } from "drizzle-orm"
import { withTenant, product } from "@pharmatrack/db"
import { generateInternalBarcode } from "@pharmatrack/core"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { canViewCost, omitCost } from "@/lib/auth/costVisibility"
import { zUuid } from "@/lib/api/validation"
import { deriveGenericName } from "@/lib/generic-name"
import { findBarcodeConflict } from "@/lib/products/barcodeConflict"

const MAX_BARCODE_GENERATION_ATTEMPTS = 5

const createProductSchema = z.object({
  name: z.string().min(1),
  brand_name: z.string().optional(),
  generic_name: z.string().optional(),
  manufacturer: z.string().optional(),
  gtin: z.string().optional(),
  barcode_raw: z.string().optional(),
  strength: z.string().optional(),
  dosage_form: z.string().optional(),
  category_id: zUuid().optional(),
  supplier_id: zUuid().nullable().optional(),
  base_unit: z.string().min(1),
  pack_label: z.string().optional(),
  units_per_pack: z.number().int().positive().default(1),
  cost_price: z.number().nonnegative().optional(),
  selling_price: z.number().positive(),
  reorder_level: z.number().int().nonnegative().default(10),
  is_controlled: z.boolean().default(false),
  requires_prescription: z.boolean().default(false),
  image_url: z.string().nullable().optional(),
  max_discount_percent: z.number().min(0).max(100).nullable().optional(),
})

export async function GET(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))
  const offset = (page - 1) * limit

  const where = q.length >= 2
    ? or(ilike(product.name, `%${q}%`), ilike(product.brand_name, `%${q}%`), ilike(product.gtin, `%${q}%`), ilike(product.strength, `%${q}%`))
    : undefined

  const { rows, total } = await withTenant(ctx, async (db) => {
    const rows = await db.select().from(product).where(where).orderBy(asc(product.name)).limit(limit).offset(offset)
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(product).where(where)
    return { rows, total: c?.n ?? 0 }
  })
  const products = canViewCost(ctx.role) ? rows : rows.map(omitCost)
  return NextResponse.json({ products, total, page, limit })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!(["owner", "manager", "pharmacist"] as Role[]).includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = createProductSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }
  const d = parsed.data
  const num = (v: number | null | undefined) => (v == null ? null : String(v))

  // Duplicate guard: same GTIN, or same name+strength+dosage_form (case-insensitive)
  // already exists in this org — most often because it was already Quick-Started
  // from the shared catalogue or added earlier by a teammate.
  const dupeConds = [
    and(
      sql`lower(${product.name}) = ${d.name.trim().toLowerCase()}`,
      d.strength ? sql`lower(${product.strength}) = ${d.strength.trim().toLowerCase()}` : isNull(product.strength),
      d.dosage_form ? sql`lower(${product.dosage_form}) = ${d.dosage_form.trim().toLowerCase()}` : isNull(product.dosage_form),
    ),
  ]
  if (d.gtin) dupeConds.push(eq(product.gtin, d.gtin))

  type DupeHit = { id: string; name: string; strength: string | null; dosage_form: string | null }
  const result = await withTenant(ctx, async (db): Promise<
    { ok: true; product: typeof product.$inferSelect } | { ok: false; dupe: DupeHit }
  > => {
    const [dupe] = await db.select({ id: product.id, name: product.name, strength: product.strength, dosage_form: product.dosage_form })
      .from(product).where(or(...dupeConds)).limit(1)
    if (dupe) return { ok: false, dupe }

    // No manufacturer GTIN or barcode supplied — generate an internal one so
    // this product is still printable/scannable (common for repackaged or
    // loose pharmacy stock). Retries on the rare conflict; falls back to no
    // barcode rather than failing the whole product creation.
    let barcodeRaw = d.barcode_raw ?? null
    if (!d.gtin && !barcodeRaw) {
      for (let attempt = 0; attempt < MAX_BARCODE_GENERATION_ATTEMPTS; attempt++) {
        const candidate = generateInternalBarcode()
        const conflict = await findBarcodeConflict(db, ctx.organizationId, [candidate])
        if (!conflict) {
          barcodeRaw = candidate
          break
        }
      }
    }

    const [created] = await db.insert(product).values({
      organization_id: ctx.organizationId,
      created_by: ctx.userId,
      name: d.name,
      brand_name: d.brand_name ?? null,
      generic_name: d.generic_name ?? deriveGenericName(d.name),
      manufacturer: d.manufacturer ?? null,
      gtin: d.gtin ?? null,
      barcode_raw: barcodeRaw,
      strength: d.strength ?? null,
      dosage_form: d.dosage_form ?? null,
      category_id: d.category_id ?? null,
      supplier_id: d.supplier_id ?? null,
      base_unit: d.base_unit,
      pack_label: d.pack_label ?? null,
      units_per_pack: d.units_per_pack,
      cost_price: num(d.cost_price),
      selling_price: String(d.selling_price),
      reorder_level: d.reorder_level,
      is_controlled: d.is_controlled,
      requires_prescription: d.requires_prescription,
      image_url: d.image_url ?? null,
      max_discount_percent: num(d.max_discount_percent),
    }).returning()
    return { ok: true, product: created! }
  })

  if (!result.ok) {
    const label = [result.dupe.name, result.dupe.strength, result.dupe.dosage_form].filter(Boolean).join(" ")
    return NextResponse.json(
      { error: `Already in your catalogue: ${label}`, existing_product_id: result.dupe.id },
      { status: 409 },
    )
  }
  return NextResponse.json({ product: result.product }, { status: 201 })
}
