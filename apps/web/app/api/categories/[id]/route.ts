import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  parent_id: z.string().uuid().nullable().optional(),
})

// Renaming / moving / deleting categories is a management action (owner/manager).
// Inline creation during product entry stays open to pharmacists via POST /api/categories.
const WRITE_ROLES = ["owner", "manager"]

async function getContext(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return { error: NextResponse.json({ error: "Profile not found" }, { status: 404 }) }
  if (!WRITE_ROLES.includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase, profile }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext(request)
  if (ctx.error) return ctx.error
  const { supabase, profile } = ctx

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  }

  const { data: cat } = await supabase
    .from("categories")
    .select("id, organization_id, parent_id")
    .eq("id", id)
    .single()
  if (!cat || cat.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 })
  }

  // Validate a parent change keeps the tree two levels deep
  if (parsed.data.parent_id !== undefined && parsed.data.parent_id !== null) {
    if (parsed.data.parent_id === id) {
      return NextResponse.json({ error: "A category cannot be its own parent" }, { status: 400 })
    }
    const { count: childCount } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", id)
    if (childCount && childCount > 0) {
      return NextResponse.json({ error: "Move its subcategories out first" }, { status: 400 })
    }
    const { data: parent } = await supabase
      .from("categories")
      .select("id, parent_id, organization_id")
      .eq("id", parsed.data.parent_id)
      .single()
    if (!parent || parent.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Parent category not found" }, { status: 400 })
    }
    if (parent.parent_id) {
      return NextResponse.json({ error: "Subcategories can only be one level deep" }, { status: 400 })
    }
  }

  const { data: category, error } = await supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", id)
    .select("id, name, parent_id")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ category })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext(request)
  if (ctx.error) return ctx.error
  const { supabase, profile } = ctx

  const { data: cat } = await supabase
    .from("categories")
    .select("id, organization_id")
    .eq("id", id)
    .single()
  if (!cat || cat.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 })
  }

  // Block delete while subcategories still exist (keeps the action predictable)
  const { count: childCount } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id)
  if (childCount && childCount > 0) {
    return NextResponse.json(
      { error: "Delete or move its subcategories first" },
      { status: 409 },
    )
  }

  // Unassign any products in this category, then delete it
  await supabase
    .from("products")
    .update({ category_id: null })
    .eq("organization_id", profile.organization_id)
    .eq("category_id", id)

  const { error } = await supabase.from("categories").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
