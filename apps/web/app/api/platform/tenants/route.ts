import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomBytes } from "node:crypto"
import { inArray, sql } from "drizzle-orm"
import { dbAdmin, organization, branch, subscription, plan, member } from "@pharmatrack/db"
import { isPlatformAdmin } from "@/lib/auth/helpers"
import { auth } from "@/lib/auth/server"
import { provisionTenant } from "@/lib/provisioning"

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

export async function POST(request: NextRequest) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = provisionSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data

  let orgId: string
  try {
    // Operator provisioning: owner gets a random password + a "set your password"
    // email, so they choose their own. autoSignIn is off, so this never touches
    // the operator's session.
    const res = await provisionTenant({
      pharmacyName: d.pharmacy_name,
      ownerEmail: d.owner_email,
      ownerName: d.owner_name,
      ownerPassword: randomBytes(24).toString("base64url"),
      branchName: d.branch_name,
      planCode: d.plan_code,
      trialDays: d.trial_days,
    })
    orgId = res.organizationId
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to provision tenant" }, { status: 500 })
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email: d.owner_email, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password` },
    })
  } catch { /* email send is best-effort; owner can use "forgot password" */ }

  return NextResponse.json({ ok: true, organization_id: orgId }, { status: 201 })
}
