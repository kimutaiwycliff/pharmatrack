import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomBytes } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import { dbAdmin, organization, branch, subscription, plan, member, user, audit_log, trial_extension_request } from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"
import { getPlatformContext } from "@/lib/platform"
import { AccountExistsError, provisionTenant } from "@/lib/provisioning"
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-status"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"
import { blockingTrials, duplicateFlagsForOrgs, findPriorTrial, requestSignals } from "@/lib/trials/eligibility"

// Operator console: list tenants + provision a new one. Operator-only; all
// queries via dbAdmin (cross-tenant, bypasses RLS).

export async function GET() {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const db = ctx.db

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
  const owners = ids.length
    ? await db.select({ org: member.organizationId, email: user.email }).from(member).innerJoin(user, eq(user.id, member.userId))
        .where(and(inArray(member.organizationId, ids), eq(member.role, "owner")))
    : []
  const pendingExt = ids.length
    ? await db.select({ org: trial_extension_request.organization_id, n: sql<number>`count(*)::int` }).from(trial_extension_request)
        .where(and(inArray(trial_extension_request.organization_id, ids), eq(trial_extension_request.status, "pending")))
        .groupBy(trial_extension_request.organization_id)
    : []
  const dupFlags = await duplicateFlagsForOrgs(ids)
  const ownerMap = new Map<string, string>()
  for (const o of owners) if (!ownerMap.has(o.org)) ownerMap.set(o.org, o.email)
  const extMap = new Map(pendingExt.map((r) => [r.org, r.n]))
  const bMap = new Map(branchCounts.map((r) => [r.org, r.n]))
  const sMap = new Map(staffCounts.map((r) => [r.org, r.n]))
  const subMap = new Map(subs.map((s) => [s.organization_id, s]))

  const tenants = orgs.map((o) => {
    const s = subMap.get(o.id)
    return {
      id: o.id,
      name: o.name,
      created_at: o.createdAt,
      subscription: s ? { id: s.id, status: effectiveSubscriptionStatus(s), trial_ends_at: s.trial_ends_at, current_period_end: s.current_period_end, plan_id: s.plan_id } : null,
      plan_name: s?.plan_id ? planName.get(s.plan_id) ?? null : null,
      branch_count: bMap.get(o.id) ?? 0,
      staff_count: sMap.get(o.id) ?? 0,
      owner_email: ownerMap.get(o.id) ?? null,
      // Another trial shares this tenant's email / Google account / PPB reg. no.
      repeat_trial: dupFlags.get(o.id)?.repeat ?? false,
      // Only the signup network (IP) matches — informational, never blocking.
      shared_ip: dupFlags.get(o.id)?.ipOnly ?? false,
      pending_trial_requests: extMap.get(o.id) ?? 0,
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
  trial_days: z.number().int().min(0).max(120).default(STANDARD_TRIAL_DAYS),
  registration_number: z.string().trim().max(60).optional(),
  // The operator saw the "previous trial" warning and grants a trial anyway.
  allow_repeat_trial: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = provisionSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data
  const registrationNumber = d.registration_number || null

  // A login with this email already exists → say so instead of a raw 500.
  const [existing] = await dbAdmin().select({ id: user.id }).from(user)
    .where(sql`lower(${user.email}) = ${d.owner_email.toLowerCase()}`).limit(1)
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists. Ask the owner to sign in, or use a different email.", code: "account_exists" }, { status: 409 })
  }

  // One trial per person: warn the operator and require an explicit override.
  const prior = d.trial_days > 0 ? await findPriorTrial({ email: d.owner_email, registrationNumber }) : []
  const repeat = blockingTrials(prior)
  if (repeat.length && !d.allow_repeat_trial) {
    return NextResponse.json({
      error: "This person has already had a PharmaTrack trial. Tick \"Grant a trial anyway\" to override, or set trial days to 0.",
      code: "prior_trial",
      prior: repeat,
    }, { status: 409 })
  }

  const signals = requestSignals(request)
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
      registrationNumber,
      // The ledger row records the operator's network, not the owner's — the
      // source column says so.
      grant: { source: "operator", ip: signals.ip, userAgent: signals.userAgent },
    })
    orgId = res.organizationId
  } catch (e) {
    if (e instanceof AccountExistsError) {
      return NextResponse.json({ error: "An account with this email already exists. Ask the owner to sign in, or use a different email.", code: "account_exists" }, { status: 409 })
    }
    console.error("[platform] provisioning failed", e)
    const msg = e instanceof Error ? e.message : ""
    const friendly = /breach|compromis|pwned/i.test(msg) ? "Generated password was rejected — please try again." : "Could not provision this tenant. Please try again."
    return NextResponse.json({ error: friendly }, { status: 500 })
  }

  try {
    await dbAdmin().insert(audit_log).values({
      organization_id: orgId, actor_id: ctx.user.id, action: "tenant.provision", entity: "organization", entity_id: orgId,
      diff: { trial_days: d.trial_days, plan_code: d.plan_code ?? null, repeat_trial_override: repeat.length > 0, prior_trial_ids: repeat.map((p) => p.id) },
    })
  } catch { /* audit is best-effort here; the tenant exists */ }

  try {
    await auth.api.requestPasswordReset({
      body: { email: d.owner_email, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password` },
    })
  } catch { /* email send is best-effort; owner can use "forgot password" */ }

  return NextResponse.json({ ok: true, organization_id: orgId }, { status: 201 })
}
