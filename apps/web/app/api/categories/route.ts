import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(60),
  parent_id: z.string().uuid().nullable().optional(),
})

const WRITE_ROLES = ["owner", "manager", "pharmacist"]

export async function GET() {
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

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id")
    .eq("organization_id", profile.organization_id)
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ categories: data ?? [] })
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
  const { name, parent_id } = parsed.data

  // Enforce two-level depth: a parent must exist, belong to the org, and itself be top-level
  if (parent_id) {
    const { data: parent } = await supabase
      .from("categories")
      .select("id, parent_id, organization_id")
      .eq("id", parent_id)
      .single()
    if (!parent || parent.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Parent category not found" }, { status: 400 })
    }
    if (parent.parent_id) {
      return NextResponse.json({ error: "Subcategories can only be one level deep" }, { status: 400 })
    }
  }

  // Friendly duplicate guard within the same parent scope (case-insensitive)
  const dupQuery = supabase
    .from("categories")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .ilike("name", name)
  const { data: dup } = parent_id
    ? await dupQuery.eq("parent_id", parent_id).maybeSingle()
    : await dupQuery.is("parent_id", null).maybeSingle()
  if (dup) {
    return NextResponse.json({ error: `"${name}" already exists here` }, { status: 409 })
  }

  const { data: category, error } = await supabase
    .from("categories")
    .insert({ name, parent_id: parent_id ?? null, organization_id: profile.organization_id })
    .select("id, name, parent_id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ category }, { status: 201 })
}
