import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { zUuid } from "@/lib/api/validation"
import { redis } from "@/lib/redis"
import { zodErrorResponse } from "@/lib/api/errors"
import type { StockAdjustment } from "@pharmatrack/types"

const REASONS = ["count_correction", "damage", "expiry", "theft_loss", "return", "other"] as const

// `set` records an absolute counted quantity; `delta` adds/removes a signed
// amount. Server reads the authoritative current quantity either way, so a
// `delta` is never applied against a stale client value.
const adjustSchema = z.object({
  batch_id: zUuid(),
  mode: z.enum(["set", "delta"]),
  value: z.number().int(),
  reason: z.enum(REASONS),
  note: z.string().trim().max(500).optional(),
})

const ALLOWED_ROLES = ["owner", "manager"]

async function invalidateProductCache(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  productId: string,
) {
  if (!redis) return
  try {
    const { data: product } = await supabase
      .from("products")
      .select("gtin, barcode_raw")
      .eq("id", productId)
      .single()
    if (product?.gtin) await redis.del(`product:${orgId}:${product.gtin}`)
    if (product?.barcode_raw) await redis.del(`product:${orgId}:${product.barcode_raw}`)
  } catch {}
}

// GET /api/inventory/adjust?product_id=...  → adjustment history for a product
export async function GET(request: NextRequest) {
  const productId = new URL(request.url).searchParams.get("product_id")
  if (!productId) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("stock_adjustments")
    .select("*, adjusted_by_profile:profiles!stock_adjustments_adjusted_by_fkey(full_name)")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ adjustments: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  if (!ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = adjustSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const { batch_id, mode, value, reason, note } = parsed.data

  // Load the batch with its product (confirms org ownership + controlled flag).
  const { data: batch, error: batchErr } = await supabase
    .from("product_batches")
    .select("id, product_id, branch_id, quantity_remaining, quantity_received, products!inner(organization_id, is_controlled)")
    .eq("id", batch_id)
    .single()

  if (batchErr || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 })
  }

  // Supabase types the embedded relation as an array; it's a single row here.
  const product = (Array.isArray(batch.products) ? batch.products[0] : batch.products) as {
    organization_id: string
    is_controlled: boolean
  }
  if (product.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const before = batch.quantity_remaining
  const after = mode === "set" ? value : before + value
  const delta = after - before

  if (after < 0) {
    return NextResponse.json(
      { error: `Cannot reduce below zero (batch has ${before} remaining)` },
      { status: 400 },
    )
  }
  if (delta === 0) {
    return NextResponse.json({ error: "No change — quantity is already that value" }, { status: 400 })
  }

  // The DB enforces quantity_remaining <= quantity_received. When a correction
  // raises remaining above the original received amount ("found more than was
  // booked in"), lift received to match so the invariant still holds.
  const newReceived = Math.max(batch.quantity_received, after)

  // Optimistic concurrency: only apply if the batch hasn't moved since we read
  // it (mirrors the guard used by the sales decrement path).
  const { data: updated, error: updErr } = await supabase
    .from("product_batches")
    .update({ quantity_remaining: after, quantity_received: newReceived })
    .eq("id", batch_id)
    .eq("quantity_remaining", before)
    .select("id")

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "Stock changed while you were editing. Reopen and try again." },
      { status: 409 },
    )
  }

  // Record the audit row.
  const { data: adjustment, error: logErr } = await supabase
    .from("stock_adjustments")
    .insert({
      organization_id: profile.organization_id,
      branch_id: batch.branch_id,
      product_id: batch.product_id,
      batch_id,
      delta,
      quantity_before: before,
      quantity_after: after,
      reason,
      note: note || null,
      adjusted_by: user.id,
    })
    .select()
    .single<StockAdjustment>()

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

  // Controlled substances get a parallel entry in the statutory register.
  if (product.is_controlled) {
    await supabase.from("controlled_substance_log").insert({
      branch_id: batch.branch_id,
      product_id: batch.product_id,
      batch_id,
      transaction_type: "adjustment",
      quantity: delta,
      balance_after: after,
      recorded_by: user.id,
    })
  }

  await invalidateProductCache(supabase, profile.organization_id, batch.product_id)

  return NextResponse.json({ adjustment }, { status: 201 })
}
