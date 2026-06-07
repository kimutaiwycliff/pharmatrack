import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"

const inviteSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  role: z.enum(["manager", "pharmacist", "cashier"]),
  branch_id: z.string().uuid().nullable().optional(),
  phone: z.string().optional(),
})

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  if (!["owner", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: staff, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, branch_id, phone, is_active, created_at, branches(name)")
    .eq("organization_id", profile.organization_id)
    .order("full_name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ staff: staff ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  if (!["owner", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json()) as unknown
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Invite via email — creates auth.users record
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: {
        full_name: parsed.data.full_name,
        role: parsed.data.role,
        organization_id: profile.organization_id,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback`,
    },
  )

  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message ?? "Failed to invite user" }, { status: 500 })
  }

  // Create profile record
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: invited.user.id,
      organization_id: profile.organization_id,
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      branch_id: parsed.data.branch_id ?? null,
      phone: parsed.data.phone ?? null,
      is_active: true,
    })

  if (profileError) {
    // Roll back the auth user if profile insert fails
    await admin.auth.admin.deleteUser(invited.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ message: "Invitation sent" }, { status: 201 })
}
