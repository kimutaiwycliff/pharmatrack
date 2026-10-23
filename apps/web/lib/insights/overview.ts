import { inArray, sql } from "drizzle-orm"
import { dbAdmin, organization, staff_profile, subscription } from "@pharmatrack/db"
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-status"
import { computeHealth, type Health, type HealthLevel } from "./health"
import { platformBilling, platformDaily, tenantRollups, type TenantRollup } from "./queries"

// The operator console overview (GET /api/platform/insights) and the weekly
// digest email share this: platform totals, the 30-day trend, and every
// pharmacy's rollup + health + follow-up state.

export interface TenantOverview extends Partial<TenantRollup> {
  id: string
  name: string
  createdAt: number
  subscriptionStatus: string | null
  renewsAt: number | null
  health: Health
  lastNoteAt: number | null
  /** the next "follow up on" date from the notes log (YYYY-MM-DD), if any */
  followUpOn: string | null
}

export async function buildOverview() {
  const db = dbAdmin()
  const orgs = await db.select({ id: organization.id, name: organization.name, createdAt: organization.createdAt }).from(organization)
  const ids = orgs.map((o) => o.id)
  const [subs, staffCounts, rollups, billing, daily, notes] = await Promise.all([
    ids.length ? db.select().from(subscription).where(inArray(subscription.organization_id, ids)) : Promise.resolve([]),
    ids.length
      ? db.select({ org: staff_profile.organization_id, n: sql<number>`count(*) FILTER (WHERE ${staff_profile.is_active})::int` })
          .from(staff_profile).where(inArray(staff_profile.organization_id, ids)).groupBy(staff_profile.organization_id)
      : Promise.resolve([]),
    tenantRollups(),
    platformBilling(),
    platformDaily(30),
    db.execute(sql`
      SELECT organization_id AS org, max(created_at) AS last_note,
             min(follow_up_on) FILTER (WHERE follow_up_on >= (now() AT TIME ZONE 'Africa/Nairobi')::date - 7)::text AS follow_up
      FROM platform_tenant_note GROUP BY 1`) as unknown as Promise<Array<{ org: string; last_note: string | null; follow_up: string | null }>>,
  ])
  const subMap = new Map(subs.map((s) => [s.organization_id, s]))
  const staffMap = new Map(staffCounts.map((r) => [r.org, r.n]))
  const noteMap = new Map(notes.map((r) => [r.org, r]))

  const now = Date.now()
  const counts: Record<HealthLevel, number> = { healthy: 0, new: 0, slipping: 0, at_risk: 0, never_started: 0, inactive: 0 }
  let revenue30 = 0, profit30 = 0, stockCost = 0, stockRetail = 0, active7 = 0, trialsEnding7 = 0, newSignups30 = 0
  const tenants: TenantOverview[] = []

  for (const o of orgs) {
    const r = rollups.get(o.id)
    const s = subMap.get(o.id)
    const status = s ? effectiveSubscriptionStatus(s) : null
    const renewsAt = s ? (status === "trialing" ? s.trial_ends_at : s.current_period_end)?.getTime() ?? null : null
    const health = computeHealth({
      now,
      createdAt: o.createdAt.getTime(),
      lastActiveAt: r?.lastActiveAt ?? null,
      firstSaleAt: r?.firstSaleAt ?? null,
      revenue30: r?.revenue30 ?? 0,
      revenuePrev30: r?.revenuePrev30 ?? 0,
      activeStaff30: r?.activeStaff30 ?? 0,
      staffCount: staffMap.get(o.id) ?? 0,
      subscriptionStatus: status,
      renewsAt,
    })
    counts[health.level]++
    revenue30 += r?.revenue30 ?? 0
    profit30 += r?.profit30 ?? 0
    stockCost += r?.stockCost ?? 0
    stockRetail += r?.stockRetail ?? 0
    if (r?.lastActiveAt && now - r.lastActiveAt <= 7 * 86_400_000) active7++
    if (status === "trialing" && renewsAt != null && renewsAt >= now && renewsAt - now <= 7 * 86_400_000) trialsEnding7++
    if (now - o.createdAt.getTime() <= 30 * 86_400_000) newSignups30++
    const note = noteMap.get(o.id)
    tenants.push({
      ...(r ?? {}), id: o.id, name: o.name, createdAt: o.createdAt.getTime(), subscriptionStatus: status, renewsAt, health,
      lastNoteAt: note?.last_note ? new Date(note.last_note).getTime() : null, followUpOn: note?.follow_up ?? null,
    })
  }

  const round = (x: number) => Math.round(x * 100) / 100
  return {
    platform: {
      ...billing,
      tenants: orgs.length,
      revenue30: round(revenue30), profit30: round(profit30), stockCost: round(stockCost), stockRetail: round(stockRetail),
      active7, trialsEnding7, newSignups30,
      atRisk: counts.slipping + counts.at_risk + counts.inactive + counts.never_started,
      health: counts,
    },
    daily,
    tenants,
  }
}

export type Overview = Awaited<ReturnType<typeof buildOverview>>
