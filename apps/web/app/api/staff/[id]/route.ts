import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { dbAdmin, staff_profile, user } from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
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
})

const WRITE_ROLES: Role[] = ["owner", "manager"]

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

  const [updated] = Object.keys(set).length > 0
    ? await db.update(staff_profile).set(set).where(eq(staff_profile.user_id, id)).returning()
    : await db.select().from(staff_profile).where(eq(staff_profile.user_id, id)).limit(1)

  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, id)).limit(1)
  return NextResponse.json({ staff: {
    id, full_name: u?.name ?? "", role: updated!.role, branch_id: updated!.branch_id,
    phone: updated!.phone, is_active: updated!.is_active,
  } })
}
