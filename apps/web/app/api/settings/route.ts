import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const orgSchema = z.object({
  name: z.string().min(2).optional(),
  registration_number: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
})

const profileSchema = z.object({
  full_name: z.string().min(2).optional(),
  phone: z.string().optional(),
})

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .single()

  const { data: branches } = await supabase
    .from("branches")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("name", { ascending: true })

  return NextResponse.json({ profile, org, branches: branches ?? [] })
}

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get("target") // "org" | "profile"

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const body = (await request.json()) as unknown

  if (target === "org") {
    if (profile.role !== "owner") {
      return NextResponse.json({ error: "Only owners can update organization settings" }, { status: 403 })
    }
    const parsed = orgSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
    }
    const { data: org, error } = await supabase
      .from("organizations")
      .update(parsed.data)
      .eq("id", profile.organization_id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ org })
  }

  if (target === "profile") {
    const parsed = profileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
    }
    const { data: updated, error } = await supabase
      .from("profiles")
      .update(parsed.data)
      .eq("id", user.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ profile: updated })
  }

  return NextResponse.json({ error: "target must be 'org' or 'profile'" }, { status: 400 })
}
