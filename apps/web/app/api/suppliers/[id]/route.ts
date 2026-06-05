import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email("Invalid email").max(120).nullable().optional().or(z.literal("")),
  address: z.string().trim().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
})

// Editing / deactivating suppliers is a management action (owner/manager).
const WRITE_ROLES = ["owner", "manager"]

async function getContext() {
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
  const ctx = await getContext()
  if (ctx.error) return ctx.error
  const { supabase, profile } = ctx

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, organization_id")
    .eq("id", id)
    .single()
  if (!existing || existing.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 })
  }

  // Normalise empty-string contact fields to null
  const d = parsed.data
  const patch = {
    ...d,
    ...(d.phone === "" ? { phone: null } : {}),
    ...(d.email === "" ? { email: null } : {}),
    ...(d.address === "" ? { address: null } : {}),
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .update(patch)
    .eq("id", id)
    .select("id, name, phone, email, address, is_active")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ supplier })
}
