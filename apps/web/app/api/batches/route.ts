import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { Redis } from "@upstash/redis"
import { z } from "zod"

let redis: Redis | null = null
try {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_URL !== "https://xxx.upstash.io"
  ) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
} catch {}

const createBatchSchema = z.object({
  product_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  batch_number: z.string().min(1),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  manufactured_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  quantity_received: z.number().int().positive(),
  cost_price: z.number().nonnegative().optional(),
  supplier_id: z.string().uuid().optional(),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("product_id")
  const branchId = searchParams.get("branch_id")

  if (!productId || !branchId) {
    return NextResponse.json({ error: "product_id and branch_id required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("product_batches")
    .select("*")
    .eq("product_id", productId)
    .eq("branch_id", branchId)
    .order("expiry_date", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ batches: data ?? [] })
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

  const allowedRoles = ["owner", "manager", "pharmacist"]
  if (!allowedRoles.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json()) as unknown
  const parsed = createBatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    )
  }

  const { data: batch, error } = await supabase
    .from("product_batches")
    .insert({
      ...parsed.data,
      quantity_remaining: parsed.data.quantity_received,
      received_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate product cache so updated stock is fetched fresh
  if (redis) {
    try {
      const { data: product } = await supabase
        .from("products")
        .select("gtin, barcode_raw")
        .eq("id", parsed.data.product_id)
        .single()

      if (product) {
        const orgId = profile.organization_id
        if (product.gtin) await redis.del(`product:${orgId}:${product.gtin}`)
        if (product.barcode_raw) await redis.del(`product:${orgId}:${product.barcode_raw}`)
      }
    } catch {}
  }

  return NextResponse.json({ batch }, { status: 201 })
}
