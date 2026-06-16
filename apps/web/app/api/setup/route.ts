import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { dbAdmin, platform_admin } from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"

// First-run bootstrap: creates the very first platform (operator) admin via
// Better Auth, then tags them in platform_admin. Self-locks once one exists.

async function adminCount(): Promise<number> {
  return (await dbAdmin().select().from(platform_admin)).length
}

export async function GET() {
  return NextResponse.json({ needsSetup: (await adminCount()) === 0 })
}

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  name: z.string().trim().max(120).optional(),
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
  const { email, name, password } = parsed.data

  let userId: string
  try {
    const res = await auth.api.signUpEmail({ body: { email, password, name: name ?? email } })
    userId = res.user.id
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create admin" }, { status: 500 })
  }

  // Re-check just before insert to narrow the race window.
  if ((await adminCount()) > 0) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 403 })
  }
  await dbAdmin().insert(platform_admin).values({ user_id: userId })
  return NextResponse.json({ ok: true })
}
