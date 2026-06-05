import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Invalid email").max(120).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional(),
})

// Creating suppliers is allowed during product/stock entry, so pharmacists qualify too.
const WRITE_ROLES = ["owner", "manager", "pharmacist"]

export async function GET(request: NextRequest) {
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  let query = supabase
    .from("suppliers")
    .select("id, name, phone, email, address, is_active")
    .eq("organization_id", profile.organization_id)
    .order("name")

  if (!includeInactive) query = query.eq("is_active", true)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ suppliers: data ?? [] })
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
  if (!WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }
  const { name, phone, email, address } = parsed.data

  // Friendly duplicate guard within the org (case-insensitive)
  const { data: dup } = await supabase
    .from("suppliers")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .ilike("name", name)
    .maybeSingle()
  if (dup) {
    return NextResponse.json({ error: `"${name}" already exists` }, { status: 409 })
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      organization_id: profile.organization_id,
    })
    .select("id, name, phone, email, address, is_active")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ supplier }, { status: 201 })
}
