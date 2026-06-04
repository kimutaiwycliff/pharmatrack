import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const packSizeSchema = z.object({
  pack_label: z.string().min(1),
  units_per_pack: z.number().int().positive(),
  selling_price: z.number().positive(),
  barcode: z.string().nullable().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("product_pack_sizes")
    .select("*")
    .eq("product_id", id)
    .order("units_per_pack", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packSizes: data ?? [] })
}

export async function POST(
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
  const parsed = packSizeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("product_pack_sizes")
    .insert({ ...parsed.data, product_id: id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packSize: data }, { status: 201 })
}
