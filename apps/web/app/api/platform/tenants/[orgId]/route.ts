import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { organization, org_settings, subscription, plan, branch, staff_profile, subscription_payment, tenant_deletion } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { getPlatformContext } from "@/lib/platform"
import { purgeTenant } from "@/lib/platform/purge"

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

  const [del] = await db.select().from(tenant_deletion).where(eq(tenant_deletion.organization_id, orgId)).limit(1)

  return NextResponse.json({
    tenant: { id: orgRow.id, name: orgRow.name, email: s.email ?? null, phone: s.phone ?? null, address: s.address ?? null, created_at: orgRow.createdAt.toISOString(), subscriptions },
    branch_count: bc?.n ?? 0,
    staff_count: sc?.n ?? 0,
    plans: plans.map((p) => ({ ...p, price_kes: Number(p.price_kes) })),
    payments: payments.map((p) => ({ ...p, amount_kes: Number(p.amount_kes) })),
    deletion: del ? { scheduled_purge_at: del.scheduled_purge_at, requested_at: del.requested_at } : null,
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

// Instant, permanent purge — bypasses the 30-day grace window. Reuses the same
// cascade+free-logins logic the soft-delete cron runs. Irreversible; requires the
// operator to type the tenant's exact name. (Soft-delete lives at ./deletion.)
const deleteNowSchema = z.object({ confirmName: z.string().min(1) })

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user: actor } = ctx

  const parsed = deleteNowSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Confirmation required" }, { status: 400 })

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  if (parsed.data.confirmName.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
    return NextResponse.json({ error: "The name you typed doesn't match this tenant" }, { status: 400 })
  }

  const freed = await purgeTenant(db, orgId)
  console.warn(`[platform] tenant "${org.name}" (${orgId}) PURGED IMMEDIATELY by ${actor.email ?? actor.id}; freed ${freed} account(s)`)
  return NextResponse.json({ ok: true, tenant: org.name, freed_accounts: freed })
}
