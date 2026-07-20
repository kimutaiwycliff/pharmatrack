import { NextRequest, NextResponse } from "next/server"
import { asc, eq } from "drizzle-orm"
import { z } from "zod"
import { dbAdmin, organization, org_settings, branch, staff_profile, user } from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"
import { getSession } from "@/lib/auth/helpers"
import { hashPin, validatePin } from "@/lib/auth/pin"
import { normalizeKePhone } from "@/lib/auth/phone"

const orgSchema = z.object({
  name: z.string().min(2).optional(),
  registration_number: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  receipt_paper_width: z.enum(["58mm", "80mm"]).optional(),
})
const profileSchema = z.object({
  full_name: z.string().min(2).optional(),
  phone: z.string().optional(),
})

// Org profile fields beyond name live in org_settings.settings (jsonb).
const ORG_SETTING_KEYS = ["registration_number", "phone", "email", "address", "receipt_paper_width"] as const
type OrgSettings = Partial<Record<(typeof ORG_SETTING_KEYS)[number], string>>

export async function GET(_request: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = dbAdmin()

  const [sp] = await db.select().from(staff_profile).where(eq(staff_profile.user_id, session.user.id)).limit(1)
  if (!sp) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const [orgRow] = await db.select().from(organization).where(eq(organization.id, sp.organization_id)).limit(1)
  const [settingsRow] = await db.select().from(org_settings).where(eq(org_settings.organization_id, sp.organization_id)).limit(1)
  const s = (settingsRow?.settings ?? {}) as OrgSettings

  const branches = await db.select().from(branch).where(eq(branch.organization_id, sp.organization_id)).orderBy(asc(branch.name))

  const profile = {
    id: session.user.id, organization_id: sp.organization_id, branch_id: sp.branch_id,
    full_name: session.user.name ?? "", phone: sp.phone, role: sp.role, is_active: sp.is_active,
    created_at: sp.created_at.toISOString(),
  }
  const org = orgRow ? { id: orgRow.id, name: orgRow.name, created_at: orgRow.createdAt.toISOString(), ...s } : null

  return NextResponse.json({ profile, has_pin: !!sp.pin_hash, org, branches })
}

export async function PATCH(request: NextRequest) {
  const target = new URL(request.url).searchParams.get("target")
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = dbAdmin()

  const [sp] = await db.select().from(staff_profile).where(eq(staff_profile.user_id, session.user.id)).limit(1)
  if (!sp) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const body = (await request.json()) as unknown

  if (target === "pin") {
    const parsed = z.object({ password: z.string().min(1, "Account password is required"), pin: z.string() }).safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
    if (!sp.phone) return NextResponse.json({ error: "Add your phone number above before setting a PIN" }, { status: 400 })
    const validation = validatePin(parsed.data.pin)
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })
    if (!session.user.email) return NextResponse.json({ error: "Account has no email to verify against" }, { status: 400 })

    // Verify the account password without disturbing the user's session: we call
    // signInEmail but never forward its Set-Cookie to the browser.
    try {
      await auth.api.signInEmail({ body: { email: session.user.email, password: parsed.data.password } })
    } catch {
      return NextResponse.json({ error: "Incorrect account password" }, { status: 403 })
    }

    const pin_hash = await hashPin(validation.pin)
    await db.update(staff_profile).set({ pin_hash }).where(eq(staff_profile.user_id, session.user.id))
    return NextResponse.json({ ok: true })
  }

  if (target === "org") {
    if (sp.role !== "owner") return NextResponse.json({ error: "Only owners can update organization settings" }, { status: 403 })
    const parsed = orgSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

    if (parsed.data.name) await db.update(organization).set({ name: parsed.data.name }).where(eq(organization.id, sp.organization_id))

    const [existing] = await db.select().from(org_settings).where(eq(org_settings.organization_id, sp.organization_id)).limit(1)
    const merged: OrgSettings = { ...(existing?.settings as OrgSettings ?? {}) }
    for (const k of ORG_SETTING_KEYS) if (parsed.data[k] !== undefined) merged[k] = parsed.data[k]
    if (existing) await db.update(org_settings).set({ settings: merged, updated_at: new Date() }).where(eq(org_settings.organization_id, sp.organization_id))
    else await db.insert(org_settings).values({ organization_id: sp.organization_id, settings: merged })

    const [orgRow] = await db.select().from(organization).where(eq(organization.id, sp.organization_id)).limit(1)
    return NextResponse.json({ org: { id: orgRow!.id, name: orgRow!.name, created_at: orgRow!.createdAt.toISOString(), ...merged } })
  }

  if (target === "profile") {
    const parsed = profileSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
    if (parsed.data.full_name !== undefined) await db.update(user).set({ name: parsed.data.full_name }).where(eq(user.id, session.user.id))
    if (parsed.data.phone !== undefined) await db.update(staff_profile).set({ phone: normalizeKePhone(parsed.data.phone) }).where(eq(staff_profile.user_id, session.user.id))

    const [sp2] = await db.select().from(staff_profile).where(eq(staff_profile.user_id, session.user.id)).limit(1)
    return NextResponse.json({ profile: {
      id: session.user.id, organization_id: sp2!.organization_id, branch_id: sp2!.branch_id,
      full_name: parsed.data.full_name ?? session.user.name ?? "", phone: sp2!.phone, role: sp2!.role, is_active: sp2!.is_active,
    } })
  }

  return NextResponse.json({ error: "target must be 'org', 'profile', or 'pin'" }, { status: 400 })
}
