import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID, randomBytes } from "node:crypto"
import { asc, eq } from "drizzle-orm"
import { dbAdmin, staff_profile, user, branch, member } from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { normalizeKePhone } from "@/lib/auth/phone"
import { requireCapacityApi } from "@/lib/entitlements"

const inviteSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  role: z.enum(["manager", "pharmacist", "cashier"]),
  branch_id: zUuid().nullable().optional(),
  phone: z.string().optional(),
})

const WRITE_ROLES: Role[] = ["owner", "manager"]

export async function GET(_request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rows = await dbAdmin().select({
    id: staff_profile.user_id, full_name: user.name, role: staff_profile.role,
    branch_id: staff_profile.branch_id, phone: staff_profile.phone, is_active: staff_profile.is_active,
    created_at: staff_profile.created_at, branch_name: branch.name,
    banned: user.banned, ban_reason: user.banReason,
  }).from(staff_profile)
    .leftJoin(user, eq(user.id, staff_profile.user_id))
    .leftJoin(branch, eq(branch.id, staff_profile.branch_id))
    .where(eq(staff_profile.organization_id, ctx.organizationId))
    .orderBy(asc(user.name))

  const staff = rows.map(({ branch_name, ...r }) => ({ ...r, branches: branch_name ? { name: branch_name } : null }))
  return NextResponse.json({ staff })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = inviteSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data
  const db = dbAdmin()

  // Plan limit: Starter = 5 staff, Growth/Enterprise = unlimited.
  const capped = await requireCapacityApi(ctx.organizationId, "staff")
  if (capped) return capped

  // Create the staff user via Better Auth, link membership + profile, then email
  // a "set your password" link (mirrors tenant owner provisioning).
  let userId: string
  try {
    const created = await auth.api.signUpEmail({
      body: { email: d.email, password: randomBytes(24).toString("base64url"), name: d.full_name },
    })
    userId = created.user.id
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to invite user" }, { status: 500 })
  }

  try {
    await db.insert(member).values({ id: randomUUID(), organizationId: ctx.organizationId, userId, role: d.role })
    await db.insert(staff_profile).values({
      user_id: userId, organization_id: ctx.organizationId, role: d.role,
      branch_id: d.branch_id ?? null, phone: d.phone ? normalizeKePhone(d.phone) : null, is_active: true,
    })
    try {
      await auth.api.requestPasswordReset({ body: { email: d.email, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password` } })
    } catch { /* email is best-effort; staff can use "forgot password" */ }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to set up staff profile" }, { status: 500 })
  }

  return NextResponse.json({ message: "Invitation sent" }, { status: 201 })
}
