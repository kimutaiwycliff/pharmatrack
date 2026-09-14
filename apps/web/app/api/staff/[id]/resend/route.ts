import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { dbAdmin, staff_profile, user } from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"

const WRITE_ROLES: Role[] = ["owner", "manager"]

// Re-send a staff member's "set your password" link (for invites that expired
// before the member used them). Owner/manager only; same org.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const db = dbAdmin()
  const [target] = await db
    .select({ org: staff_profile.organization_id, email: user.email, name: user.name })
    .from(staff_profile)
    .leftJoin(user, eq(user.id, staff_profile.user_id))
    .where(eq(staff_profile.user_id, id))
    .limit(1)

  if (!target || target.org !== ctx.organizationId) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
  }
  if (!target.email) {
    return NextResponse.json({ error: "This member has no email to send an invite to" }, { status: 400 })
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email: target.email, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password` },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to send invite" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email: target.email })
}
