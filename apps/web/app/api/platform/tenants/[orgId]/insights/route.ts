import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { member, organization, staff_profile, subscription, user } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-status"
import { computeHealth } from "@/lib/insights/health"
import { tenantDetail } from "@/lib/insights/queries"

// GET /api/platform/tenants/[orgId]/insights — one pharmacy in depth for the
// operator: usage, sales, profit, stock value, staff, devices, feature
// adoption, setup milestones, health, and how to reach the owner.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { orgId } = await params
  const db = ctx.db

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
  const [[sub], [owner], detail] = await Promise.all([
    db.select().from(subscription).where(eq(subscription.organization_id, orgId)).limit(1),
    db.select({ name: user.name, email: user.email, phone: staff_profile.phone })
      .from(member).innerJoin(user, eq(user.id, member.userId))
      .leftJoin(staff_profile, and(eq(staff_profile.user_id, user.id), eq(staff_profile.organization_id, orgId)))
      .where(and(eq(member.organizationId, orgId), eq(member.role, "owner"))).limit(1),
    tenantDetail(orgId, 90),
  ])

  const status = sub ? effectiveSubscriptionStatus(sub) : null
  const health = computeHealth({
    now: Date.now(),
    createdAt: org.createdAt.getTime(),
    lastActiveAt: detail.summary.lastActiveAt,
    firstSaleAt: detail.milestones.first_sale ?? null,
    revenue30: detail.summary.revenue30,
    revenuePrev30: detail.summary.prev.revenue30,
    activeStaff30: detail.summary.activeStaff30,
    staffCount: detail.staff.filter((s) => s.active).length,
    subscriptionStatus: status,
    renewsAt: sub ? (status === "trialing" ? sub.trial_ends_at : sub.current_period_end)?.getTime() ?? null : null,
  })

  return NextResponse.json({
    ...detail,
    health,
    period: 90,
    contact: {
      pharmacy: org.name,
      name: owner?.name ?? null,
      email: owner?.email ?? null,
      phone: owner?.phone ?? null,
    },
  }, { headers: { "Cache-Control": "no-store" } })
}
