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

const createProductSchema = z.object({
  name: z.string().min(1),
  brand_name: z.string().optional(),
  manufacturer: z.string().optional(),
  gtin: z.string().optional(),
  barcode_raw: z.string().optional(),
  strength: z.string().optional(),
  dosage_form: z.string().optional(),
  category_id: z.string().uuid().optional(),
  base_unit: z.string().min(1),
  pack_label: z.string().optional(),
  units_per_pack: z.number().int().positive().default(1),
  cost_price: z.number().nonnegative().optional(),
  selling_price: z.number().positive(),
  reorder_level: z.number().int().nonnegative().default(10),
  reorder_quantity: z.number().int().positive().default(100),
  is_controlled: z.boolean().default(false),
  requires_prescription: z.boolean().default(false),
})

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
  const parsed = createProductSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    )
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      ...parsed.data,
      organization_id: profile.organization_id,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate Redis cache for this barcode
  if (redis && parsed.data.gtin) {
    try {
      await redis.del(`product:${profile.organization_id}:${parsed.data.gtin}`)
    } catch {}
  }
  if (redis && parsed.data.barcode_raw) {
    try {
      await redis.del(`product:${profile.organization_id}:${parsed.data.barcode_raw}`)
    } catch {}
  }

  return NextResponse.json({ product }, { status: 201 })
}
