import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { redis } from "@/lib/redis"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  brand_name: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  gtin: z.string().nullable().optional(),
  barcode_raw: z.string().nullable().optional(),
  strength: z.string().nullable().optional(),
  dosage_form: z.string().optional(),
  category_id: z.string().uuid().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  base_unit: z.string().min(1).optional(),
  pack_label: z.string().nullable().optional(),
  units_per_pack: z.number().int().positive().optional(),
  cost_price: z.number().nonnegative().nullable().optional(),
  selling_price: z.number().positive().optional(),
  reorder_level: z.number().int().nonnegative().optional(),
  reorder_quantity: z.number().int().positive().optional(),
  is_controlled: z.boolean().optional(),
  requires_prescription: z.boolean().optional(),
  image_url: z.string().nullable().optional(),
  max_discount_percent: z.number().min(0).max(100).nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles").select("organization_id").eq("id", user.id).single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single()

  if (error || !product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

  const { data: packSizes } = await supabase
    .from("product_pack_sizes")
    .select("*")
    .eq("product_id", id)
    .order("units_per_pack", { ascending: true })

  return NextResponse.json({ product, packSizes: packSizes ?? [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles").select("organization_id, role").eq("id", user.id).single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  if (!["owner", "manager", "pharmacist"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json()) as unknown
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from("products").select("organization_id, gtin, barcode_raw").eq("id", id).single()
  if (!existing || existing.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  const { data: product, error } = await supabase
    .from("products")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate Redis cache
  if (redis) {
    try {
      const orgId = profile.organization_id
      const gtin = parsed.data.gtin ?? existing.gtin
      const raw = parsed.data.barcode_raw ?? existing.barcode_raw
      if (gtin) await redis.del(`product:${orgId}:${gtin}`)
      if (raw) await redis.del(`product:${orgId}:${raw}`)
    } catch {}
  }

  return NextResponse.json({ product })
}
