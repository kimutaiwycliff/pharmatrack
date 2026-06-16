import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomBytes, randomUUID } from "node:crypto"
import { eq, inArray, sql } from "drizzle-orm"
import {
  dbAdmin, organization, branch, subscription, plan, member,
  staff_profile, appointment_service,
} from "@pharmatrack/db"
import { isPlatformAdmin } from "@/lib/auth/helpers"
import { auth } from "@/lib/auth/server"

// Operator console: list tenants + provision a new one. Operator-only; all
// queries via dbAdmin (cross-tenant, bypasses RLS).

export async function GET() {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const db = dbAdmin()

  const orgs = await db.select().from(organization).orderBy(sql`${organization.createdAt} desc`)
  const ids = orgs.map((o) => o.id)
  const subs = ids.length ? await db.select().from(subscription).where(inArray(subscription.organization_id, ids)) : []
  const plans = await db.select().from(plan)
  const planName = new Map(plans.map((p) => [p.id, p.name]))

  const branchCounts = ids.length
    ? await db.select({ org: branch.organization_id, n: sql<number>`count(*)::int` }).from(branch).where(inArray(branch.organization_id, ids)).groupBy(branch.organization_id)
    : []
  const staffCounts = ids.length
    ? await db.select({ org: member.organizationId, n: sql<number>`count(*)::int` }).from(member).where(inArray(member.organizationId, ids)).groupBy(member.organizationId)
    : []
  const bMap = new Map(branchCounts.map((r) => [r.org, r.n]))
  const sMap = new Map(staffCounts.map((r) => [r.org, r.n]))
  const subMap = new Map(subs.map((s) => [s.organization_id, s]))

  const tenants = orgs.map((o) => {
    const s = subMap.get(o.id)
    return {
      id: o.id,
      name: o.name,
      created_at: o.createdAt,
      subscription: s ? { id: s.id, status: s.status, trial_ends_at: s.trial_ends_at, current_period_end: s.current_period_end, plan_id: s.plan_id } : null,
      plan_name: s?.plan_id ? planName.get(s.plan_id) ?? null : null,
      branch_count: bMap.get(o.id) ?? 0,
      staff_count: sMap.get(o.id) ?? 0,
    }
  })
  return NextResponse.json({ tenants })
}

const provisionSchema = z.object({
  pharmacy_name: z.string().trim().min(1).max(120),
  owner_email: z.string().trim().email(),
  owner_name: z.string().trim().min(2).max(120),
  branch_name: z.string().trim().min(1).max(120).optional(),
  plan_code: z.string().optional(),
  trial_days: z.number().int().min(0).max(120).default(14),
})

const DEFAULT_SERVICES: Array<[string, string, number | null, number]> = [
  ["family_planning_depo", "Family Planning — Depo-Provera", 12, 0],
  ["vaccination", "Vaccination / Immunization", null, 1],
  ["injection", "Injection (other)", null, 2],
  ["consultation", "Consultation", null, 3],
  ["other", "Other", null, 4],
]

export async function POST(request: NextRequest) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = provisionSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data
  const db = dbAdmin()

  const orgId = randomUUID()
  const trialEnds = new Date(Date.now() + d.trial_days * 86_400_000)
  const [planRow] = await db.select().from(plan).where(eq(plan.code, d.plan_code ?? "starter")).limit(1)

  // 1) Org + branch + subscription + default services (service-level, no tenant ctx).
  await db.insert(organization).values({ id: orgId, name: d.pharmacy_name, createdAt: new Date() })
  const [b] = await db.insert(branch).values({ organization_id: orgId, name: d.branch_name || "Main Branch" }).returning()
  await db.insert(subscription).values({
    organization_id: orgId,
    plan_id: planRow?.id ?? null,
    status: d.trial_days > 0 ? "trialing" : "active",
    trial_ends_at: d.trial_days > 0 ? trialEnds : null,
    current_period_end: trialEnds,
  })
  await db.insert(appointment_service).values(
    DEFAULT_SERVICES.map(([slug, label, recurrence_weeks, sort_order]) => ({
      organization_id: orgId, slug, label, recurrence_weeks, sort_order,
    })),
  )

  // 2) Create the owner via Better Auth, link membership + staff profile, then
  //    email them a "set your password" link.
  try {
    const created = await auth.api.signUpEmail({
      body: { email: d.owner_email, password: randomBytes(24).toString("base64url"), name: d.owner_name },
    })
    const ownerId = created.user.id
    await db.insert(member).values({ id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" })
    await db.insert(staff_profile).values({ user_id: ownerId, organization_id: orgId, role: "owner", branch_id: b?.id ?? null })
    try {
      await auth.api.requestPasswordReset({
        body: { email: d.owner_email, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password` },
      })
    } catch { /* email send is best-effort; owner can use "forgot password" */ }
  } catch (e) {
    // Roll back the tenant so a failed owner setup doesn't orphan an org.
    await db.delete(organization).where(eq(organization.id, orgId))
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create owner" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, organization_id: orgId }, { status: 201 })
}
