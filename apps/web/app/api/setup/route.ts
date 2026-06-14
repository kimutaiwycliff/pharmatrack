import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient, createAdminClient } from "@/lib/supabase/server"

// First-run bootstrap: creates the very first platform (SaaS operator) admin.
// Self-locking — once any platform admin exists, this endpoint refuses, so it
// can't be used to mint extra operators later.

async function adminCount() {
  const admin = createAdminClient()
  const { count } = await admin
    .from("platform_admins")
    .select("user_id", { count: "exact", head: true })
  return count ?? 0
}

export async function GET() {
  return NextResponse.json({ needsSetup: (await adminCount()) === 0 })
}

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  full_name: z.string().trim().max(120).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export async function POST(request: NextRequest) {
  if ((await adminCount()) > 0) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 403 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  }
  const { email, full_name, password } = parsed.data

  const admin = createAdminClient()

  // Create the operator's auth user (email pre-confirmed so they can sign in
  // immediately). If the email already exists, promote that account instead.
  let userId: string | null = null
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: full_name ? { full_name } : undefined,
  })
  if (created?.user) {
    userId = created.user.id
  } else if (createErr) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!existing) {
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }
    userId = existing.id
  }
  if (!userId) {
    return NextResponse.json({ error: "Failed to create admin user" }, { status: 500 })
  }

  // Re-check emptiness right before insert to narrow the race window.
  if ((await adminCount()) > 0) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 403 })
  }
  const { error: insErr } = await admin.from("platform_admins").insert({ user_id: userId })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Establish a session on the cookie client so they land in /platform signed in.
  const supabase = await createClient()
  await supabase.auth.signInWithPassword({ email, password })

  return NextResponse.json({ ok: true })
}
