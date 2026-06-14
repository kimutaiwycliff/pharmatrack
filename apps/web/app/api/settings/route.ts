import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { hashPin, validatePin } from "@/lib/auth/pin"
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

  // Never ship the PIN hash to the client — expose only whether one is set.
  const { pin_hash, ...safeProfile } = profile
  return NextResponse.json({
    profile: safeProfile,
    has_pin: !!pin_hash,
    org,
    branches: branches ?? [],
  })
}

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get("target") // "org" | "profile"

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role, phone")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const body = (await request.json()) as unknown

  if (target === "pin") {
    const pinSchema = z.object({
      password: z.string().min(1, "Account password is required"),
      pin: z.string(),
    })
    const parsed = pinSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
    }

    // PIN login matches by phone, so a phone number must already be set.
    if (!profile.phone) {
      return NextResponse.json(
        { error: "Add your phone number above before setting a PIN" },
        { status: 400 },
      )
    }

    const validation = validatePin(parsed.data.pin)
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })

    if (!user.email) {
      return NextResponse.json({ error: "Account has no email to verify against" }, { status: 400 })
    }

    // Verify the account password on a throwaway client so the user's cookie
    // session is left untouched.
    const verifier = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { error: pwError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.password,
    })
    if (pwError) return NextResponse.json({ error: "Incorrect account password" }, { status: 403 })

    const pin_hash = await hashPin(validation.pin)
    const { error } = await supabase
      .from("profiles")
      .update({ pin_hash })
      .eq("id", user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

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

  return NextResponse.json({ error: "target must be 'org', 'profile', or 'pin'" }, { status: 400 })
}
