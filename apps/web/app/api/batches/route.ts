import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, asc } from "drizzle-orm"
import { withTenant, product, product_batch } from "@pharmatrack/db"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { canViewCost, omitCost } from "@/lib/auth/costVisibility"
import { zUuid } from "@/lib/api/validation"
import { redis } from "@/lib/redis"
import { apiError, zodErrorResponse } from "@/lib/api/errors"

const createBatchSchema = z.object({
  product_id: zUuid(),
  branch_id: zUuid(),
  batch_number: z.string().min(1),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  manufactured_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  quantity_received: z.number().int().positive(),
  cost_price: z.number().nonnegative().optional(),
  supplier_id: zUuid().optional(),
  notes: z.string().optional(),
})

const updateBatchSchema = z.object({
  id: zUuid(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format").optional(),
  batch_number: z.string().trim().min(1).optional(),
  cost_price: z.number().nonnegative().nullable().optional(),
}).refine(
  (d) => d.expiry_date !== undefined || d.batch_number !== undefined || d.cost_price !== undefined,
  { message: "Nothing to update" },
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("product_id")
  const branchId = searchParams.get("branch_id")
  if (!productId || !branchId) return apiError("product_id and branch_id required")

  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const rows = await withTenant(ctx, (db) =>
    db.select().from(product_batch)
      .where(and(eq(product_batch.product_id, productId), eq(product_batch.branch_id, branchId)))
      .orderBy(asc(product_batch.expiry_date)),
  )
  const batches = canViewCost(ctx.role) ? rows : rows.map(omitCost)
  return NextResponse.json({ batches })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!(["owner", "manager", "pharmacist"] as Role[]).includes(ctx.role)) return apiError("Forbidden", 403)

  const parsed = createBatchSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const d = parsed.data

  const batch = await withTenant(ctx, async (db) => {
    const [b] = await db.insert(product_batch).values({
      organization_id: ctx.organizationId,
      product_id: d.product_id,
      branch_id: d.branch_id,
      supplier_id: d.supplier_id ?? null,
      batch_number: d.batch_number,
      expiry_date: d.expiry_date,
      quantity_received: d.quantity_received,
      quantity_remaining: d.quantity_received,
      cost_price: d.cost_price == null ? null : String(d.cost_price),
      received_by: ctx.userId,
    }).returning()
    return b
  })

  // Best-effort cache invalidation for this product's barcodes at this branch.
  if (redis) {
    try {
      const [p] = await withTenant(ctx, (db) =>
        db.select({ gtin: product.gtin, barcode_raw: product.barcode_raw }).from(product).where(eq(product.id, d.product_id)).limit(1),
      )
      const keys = [p?.gtin, p?.barcode_raw].filter(Boolean) as string[]
      for (const k of keys) await redis.del(`product:${ctx.organizationId}:${d.branch_id}:${k}`)
    } catch {}
  }

  return NextResponse.json({ batch }, { status: 201 })
}

// Edit a batch's metadata (expiry date, batch number, cost). Quantity is NOT
// editable here — stock changes go through /api/inventory/adjust for the audit
// trail. RLS scopes the update to the caller's org.
export async function PATCH(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!(["owner", "manager", "pharmacist"] as Role[]).includes(ctx.role)) return apiError("Forbidden", 403)

  const parsed = updateBatchSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const d = parsed.data

  const set: Partial<typeof product_batch.$inferInsert> = {}
  if (d.expiry_date !== undefined) set.expiry_date = d.expiry_date
  if (d.batch_number !== undefined) set.batch_number = d.batch_number
  // Correcting an already-recorded batch's cost is "browsing", not the one-off
  // entry receiving allows — restrict it like every other cost edit.
  if (d.cost_price !== undefined && canViewCost(ctx.role)) set.cost_price = d.cost_price === null ? null : String(d.cost_price)

  const [updated] = await withTenant(ctx, (db) =>
    db.update(product_batch).set(set).where(eq(product_batch.id, d.id)).returning(),
  )
  if (!updated) return apiError("Batch not found", 404)

  // Cost/expiry feed barcode-lookup responses — clear that product's cache.
  if (redis) {
    try {
      const [p] = await withTenant(ctx, (db) =>
        db.select({ gtin: product.gtin, barcode_raw: product.barcode_raw }).from(product).where(eq(product.id, updated.product_id)).limit(1),
      )
      const keys = [p?.gtin, p?.barcode_raw].filter(Boolean) as string[]
      for (const k of keys) await redis.del(`product:${ctx.organizationId}:${updated.branch_id}:${k}`)
    } catch {}
  }

  return NextResponse.json({ batch: canViewCost(ctx.role) ? updated : omitCost(updated) })
}
