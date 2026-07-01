import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { organization, org_settings, subscription, plan, branch, staff_profile, subscription_payment, user } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { getPlatformContext } from "@/lib/platform"

type OrgSettings = { email?: string; phone?: string; address?: string; registration_number?: string }

export async function GET(_request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db } = ctx

  const [orgRow] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!orgRow) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  const [settingsRow] = await db.select().from(org_settings).where(eq(org_settings.organization_id, orgId)).limit(1)
  const s = (settingsRow?.settings ?? {}) as OrgSettings

  const [sub] = await db.select({ row: subscription, plan_name: plan.name, plan_price: plan.price_kes, plan_interval: plan.interval })
    .from(subscription).leftJoin(plan, eq(plan.id, subscription.plan_id)).where(eq(subscription.organization_id, orgId)).limit(1)

  const [[bc], [sc], plans, payments] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(branch).where(eq(branch.organization_id, orgId)),
    db.select({ n: sql<number>`count(*)::int` }).from(staff_profile).where(eq(staff_profile.organization_id, orgId)),
    db.select({ id: plan.id, code: plan.code, name: plan.name, price_kes: plan.price_kes, interval: plan.interval }).from(plan).where(eq(plan.is_active, true)).orderBy(asc(plan.price_kes)),
    db.select().from(subscription_payment).where(eq(subscription_payment.organization_id, orgId)).orderBy(desc(subscription_payment.created_at)).limit(20),
  ])

  const subscriptions = sub
    ? [{ ...sub.row, plan: sub.plan_name ? { name: sub.plan_name, price_kes: Number(sub.plan_price), interval: sub.plan_interval } : null }]
    : []

  return NextResponse.json({
    tenant: { id: orgRow.id, name: orgRow.name, email: s.email ?? null, phone: s.phone ?? null, address: s.address ?? null, created_at: orgRow.createdAt.toISOString(), subscriptions },
    branch_count: bc?.n ?? 0,
    staff_count: sc?.n ?? 0,
    plans: plans.map((p) => ({ ...p, price_kes: Number(p.price_kes) })),
    payments: payments.map((p) => ({ ...p, amount_kes: Number(p.amount_kes) })),
  })
}

const patchSchema = z.object({
  status: z.enum(["trialing", "active", "past_due", "suspended", "cancelled"]).optional(),
  plan_id: zUuid().nullable().optional(),
  current_period_end: z.string().datetime({ offset: true }).nullable().optional(),
  trial_ends_at: z.string().datetime({ offset: true }).nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data

  const [updated] = await ctx.db.update(subscription).set({
    ...(d.status !== undefined && { status: d.status }),
    ...(d.plan_id !== undefined && { plan_id: d.plan_id }),
    ...(d.current_period_end !== undefined && { current_period_end: d.current_period_end ? new Date(d.current_period_end) : null }),
    ...(d.trial_ends_at !== undefined && { trial_ends_at: d.trial_ends_at ? new Date(d.trial_ends_at) : null }),
    updated_at: new Date(),
  }).where(eq(subscription.organization_id, orgId)).returning()

  return NextResponse.json({ subscription: updated })
}

// Permanently delete a tenant and ALL of its data. Every organization_id-scoped
// table is FK'd to organization ON DELETE CASCADE, so a single delete wipes
// branches, products, inventory, sales, customers, subscription + payments,
// staff_profile, member, invitation, org_settings and audit_log. We also remove
// the staff LOGIN accounts that belonged solely to this tenant (cascading their
// sessions + accounts) so the email is free to sign up again. Platform operators
// and users who also belong to another org are preserved. Requires the operator
// to type the tenant's exact name.
const deleteSchema = z.object({ confirmName: z.string().min(1) })

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user: actor } = ctx

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Confirmation required" }, { status: 400 })

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  if (parsed.data.confirmName.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
    return NextResponse.json({ error: "The name you typed doesn't match this tenant" }, { status: 400 })
  }

  let freedAccounts = 0
  await db.transaction(async (tx) => {
    // Accounts that belong ONLY to this org and aren't platform operators —
    // computed while the member rows still exist (before the cascading delete).
    const eligible = (await tx.execute(sql`
      SELECT u."id" AS id
      FROM "user" u
      JOIN "member" m ON m."userId" = u."id" AND m."organizationId" = ${orgId}
      WHERE NOT EXISTS (SELECT 1 FROM "member" m2 WHERE m2."userId" = u."id" AND m2."organizationId" <> ${orgId})
        AND NOT EXISTS (SELECT 1 FROM "platform_admin" p WHERE p."user_id" = u."id")
    `)) as unknown as Array<{ id: string }>
    const ids = eligible.map((r) => r.id)

    // Cascades every organization_id-scoped table.
    await tx.delete(organization).where(eq(organization.id, orgId))

    // Free the orphaned logins (cascades their sessions + accounts).
    if (ids.length) {
      await tx.delete(user).where(inArray(user.id, ids))
      freedAccounts = ids.length
    }
  })

  console.warn(`[platform] tenant "${org.name}" (${orgId}) deleted by ${actor.email ?? actor.id}; freed ${freedAccounts} account(s)`)
  return NextResponse.json({ ok: true, tenant: org.name, freed_accounts: freedAccounts })
}
