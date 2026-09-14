import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, sql } from "drizzle-orm"
import { dbAdmin, staff_profile, user, member, session, sale } from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { hashPin, validatePin } from "@/lib/auth/pin"
import { normalizeKePhone } from "@/lib/auth/phone"

const updateSchema = z.object({
  role: z.enum(["manager", "pharmacist", "cashier"]).optional(),
  branch_id: zUuid().nullable().optional(),
  phone: z.string().optional(),
  is_active: z.boolean().optional(),
  pin: z.string().optional(),
  // Owner/manager can set a staff member's dashboard login password directly
  // (their email is the username). 8+ chars; no email round-trip needed.
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  // Block (suspend/ban) or unblock. Enforced via Better Auth's `banned` flag,
  // which rejects email sign-in; is_active mirrors it so PIN login is blocked
  // too. block_reason is a label that distinguishes suspend vs ban in the UI.
  blocked: z.boolean().optional(),
  block_reason: z.enum(["suspended", "banned"]).optional(),
})

const WRITE_ROLES: Role[] = ["owner", "manager"]

/** Shared guard: resolve the target staff member and check the caller may act on
 *  them (same org; managers can't touch owners/managers). */
async function resolveTarget(ctx: { organizationId: string; role: Role }, id: string) {
  const db = dbAdmin()
  const [target] = await db
    .select({ organization_id: staff_profile.organization_id, role: staff_profile.role, phone: staff_profile.phone })
    .from(staff_profile).where(eq(staff_profile.user_id, id)).limit(1)
  if (!target || target.organization_id !== ctx.organizationId) {
    return { error: NextResponse.json({ error: "Staff member not found" }, { status: 404 }) }
  }
  if (ctx.role === "manager" && ["owner", "manager"].includes(target.role)) {
    return { error: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }) }
  }
  return { target }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (id === ctx.userId) return NextResponse.json({ error: "Cannot edit your own profile here" }, { status: 400 })

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })

  const normalizedPhone = parsed.data.phone !== undefined ? normalizeKePhone(parsed.data.phone) : undefined
  const db = dbAdmin()

  // Target must be in the same org.
  const [target] = await db.select({ organization_id: staff_profile.organization_id, role: staff_profile.role, phone: staff_profile.phone })
    .from(staff_profile).where(eq(staff_profile.user_id, id)).limit(1)
  if (!target || target.organization_id !== ctx.organizationId) return NextResponse.json({ error: "Staff member not found" }, { status: 404 })

  // Managers cannot edit other managers or owners.
  if (ctx.role === "manager" && ["owner", "manager"].includes(target.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  // A PIN, if provided, must be valid and the member must have a phone (PIN login matches by phone).
  let pin_hash: string | undefined
  if (parsed.data.pin !== undefined) {
    const validation = validatePin(parsed.data.pin)
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })
    const effectivePhone = normalizedPhone ?? target.phone
    if (!effectivePhone) return NextResponse.json({ error: "Set a phone number for this member before assigning a PIN" }, { status: 400 })
    pin_hash = await hashPin(validation.pin)
  }

  const set: Partial<typeof staff_profile.$inferInsert> = {}
  if (parsed.data.role !== undefined) set.role = parsed.data.role
  if (parsed.data.branch_id !== undefined) set.branch_id = parsed.data.branch_id
  if (normalizedPhone !== undefined) set.phone = normalizedPhone
  if (parsed.data.is_active !== undefined) set.is_active = parsed.data.is_active
  if (pin_hash !== undefined) set.pin_hash = pin_hash

  // Set the login password directly (updates the existing credential account).
  if (parsed.data.password !== undefined) {
    try {
      const c = await auth.$context
      const hashed = await c.password.hash(parsed.data.password)
      await c.internalAdapter.updatePassword(id, hashed)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to set password" }, { status: 500 })
    }
  }

  // Block / unblock: Better Auth `banned` is the real enforcement (blocks email
  // sign-in); mirror it onto is_active for PIN login, and kill live sessions.
  if (parsed.data.blocked !== undefined) {
    const blocked = parsed.data.blocked
    await db.update(user).set({
      banned: blocked,
      banReason: blocked ? (parsed.data.block_reason ?? "suspended") : null,
      banExpires: null,
      updatedAt: new Date(),
    }).where(eq(user.id, id))
    set.is_active = !blocked
    if (blocked) await db.delete(session).where(eq(session.userId, id))
  }

  const [updated] = Object.keys(set).length > 0
    ? await db.update(staff_profile).set(set).where(eq(staff_profile.user_id, id)).returning()
    : await db.select().from(staff_profile).where(eq(staff_profile.user_id, id)).limit(1)

  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, id)).limit(1)
  return NextResponse.json({ staff: {
    id, full_name: u?.name ?? "", role: updated!.role, branch_id: updated!.branch_id,
    phone: updated!.phone, is_active: updated!.is_active,
  } })
}

// Remove a staff member from the pharmacy. If they have no sales we fully delete
// the user (cascades staff_profile, member, account, session) so the email can be
// re-invited; if they have sales (referenced by sale.cashier_id) we keep the user
// row for history but strip their org access + ban + kill sessions.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (id === ctx.userId) return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 })

  const r = await resolveTarget(ctx, id)
  if (r.error) return r.error

  const db = dbAdmin()
  const counted = await db.select({ n: sql<number>`count(*)::int` }).from(sale).where(eq(sale.cashier_id, id))
  const n = counted[0]?.n ?? 0

  if (n === 0) {
    await db.delete(user).where(eq(user.id, id)) // cascades member, staff_profile, account, session
    return NextResponse.json({ ok: true, deleted: "full" })
  }

  // Has sales → preserve the user for records; revoke access instead.
  await db.delete(staff_profile).where(eq(staff_profile.user_id, id))
  await db.delete(member).where(eq(member.userId, id))
  await db.delete(session).where(eq(session.userId, id))
  await db.update(user).set({ banned: true, banReason: "removed", updatedAt: new Date() }).where(eq(user.id, id))
  return NextResponse.json({ ok: true, deleted: "revoked", note: "Member had sales history — access removed, records kept." })
}
