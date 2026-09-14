import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, desc } from "drizzle-orm"
import {
  withTenant, dbAdmin, product, product_batch, stock_adjustment,
  controlled_substance_log, user,
} from "@pharmatrack/db"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { redis } from "@/lib/redis"
import { zodErrorResponse } from "@/lib/api/errors"

const REASONS = ["count_correction", "damage", "expiry", "theft_loss", "return", "other"] as const
const adjustSchema = z.object({
  batch_id: zUuid(),
  mode: z.enum(["set", "delta"]),
  value: z.number().int(),
  reason: z.enum(REASONS),
  note: z.string().trim().max(500).optional(),
})

async function invalidateProductCache(orgId: string, productId: string) {
  if (!redis) return
  try {
    const [p] = await dbAdmin().select({ gtin: product.gtin, barcode_raw: product.barcode_raw }).from(product).where(eq(product.id, productId)).limit(1)
    for (const k of [p?.gtin, p?.barcode_raw].filter(Boolean) as string[]) {
      // branch-agnostic best-effort clear
      await redis.del(`product:${orgId}:${k}`)
    }
  } catch {}
}

// GET ?product_id=... → adjustment history (joined through the batch).
export async function GET(request: NextRequest) {
  const productId = new URL(request.url).searchParams.get("product_id")
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 })
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const rows = await withTenant(ctx, (db) =>
    db.select({
      id: stock_adjustment.id, delta: stock_adjustment.delta,
      quantity_before: stock_adjustment.quantity_before, quantity_after: stock_adjustment.quantity_after,
      reason: stock_adjustment.reason, note: stock_adjustment.note, created_at: stock_adjustment.created_at,
      full_name: user.name,
    }).from(stock_adjustment)
      .innerJoin(product_batch, eq(product_batch.id, stock_adjustment.batch_id))
      .leftJoin(user, eq(user.id, stock_adjustment.adjusted_by))
      .where(eq(product_batch.product_id, productId))
      .orderBy(desc(stock_adjustment.created_at)).limit(50),
  )
  const adjustments = rows.map(({ full_name, ...r }) => ({ ...r, adjusted_by_profile: full_name ? { full_name } : null }))
  return NextResponse.json({ adjustments })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!(["owner", "manager"] as Role[]).includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = adjustSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const { batch_id, mode, value, reason, note } = parsed.data

  const out = await withTenant(ctx, async (db) => {
    const [b] = await db.select({
      id: product_batch.id, product_id: product_batch.product_id, branch_id: product_batch.branch_id,
      batch_number: product_batch.batch_number, quantity_remaining: product_batch.quantity_remaining,
      quantity_received: product_batch.quantity_received, is_controlled: product.is_controlled,
    }).from(product_batch).innerJoin(product, eq(product.id, product_batch.product_id))
      .where(eq(product_batch.id, batch_id)).limit(1)
    if (!b) return { status: 404, body: { error: "Batch not found" } }

    const before = b.quantity_remaining
    const after = mode === "set" ? value : before + value
    const delta = after - before
    if (after < 0) return { status: 400, body: { error: `Cannot reduce below zero (batch has ${before} remaining)` } }
    if (delta === 0) return { status: 400, body: { error: "No change — quantity is already that value" } }
    const newReceived = Math.max(b.quantity_received, after)

    // Optimistic concurrency: only apply if the batch hasn't moved.
    const updated = await db.update(product_batch)
      .set({ quantity_remaining: after, quantity_received: newReceived })
      .where(and(eq(product_batch.id, batch_id), eq(product_batch.quantity_remaining, before)))
      .returning({ id: product_batch.id })
    if (updated.length === 0) return { status: 409, body: { error: "Stock changed while you were editing. Reopen and try again." } }

    const [adjustment] = await db.insert(stock_adjustment).values({
      organization_id: ctx.organizationId, batch_id, reason, delta,
      quantity_before: before, quantity_after: after, note: note || null, adjusted_by: ctx.userId,
    }).returning()

    if (b.is_controlled) {
      await db.insert(controlled_substance_log).values({
        organization_id: ctx.organizationId, quantity: delta, batch_number: b.batch_number,
      })
    }
    return { status: 201, body: { adjustment }, productId: b.product_id }
  })

  if (out.status === 201 && "productId" in out && out.productId) await invalidateProductCache(ctx.organizationId, out.productId)
  return NextResponse.json(out.body, { status: out.status })
}
