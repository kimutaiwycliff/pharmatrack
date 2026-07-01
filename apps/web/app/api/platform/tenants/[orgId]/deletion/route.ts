import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { organization, subscription, tenant_deletion } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"

// 30-day soft-delete grace window. The tenant is blocked (subscription set to
// 'cancelled') while scheduled; a cron purges after this. Cancelling restores it.
const GRACE_DAYS = 30

const scheduleSchema = z.object({ confirmName: z.string().min(1), reason: z.string().max(500).optional() })

// Schedule a tenant for deletion (soft-delete, reversible until the purge date).
export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user: actor } = ctx

  const parsed = scheduleSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Confirmation required" }, { status: 400 })

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  if (parsed.data.confirmName.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
    return NextResponse.json({ error: "The name you typed doesn't match this tenant" }, { status: 400 })
  }

  const [existing] = await db.select().from(tenant_deletion).where(eq(tenant_deletion.organization_id, orgId)).limit(1)
  const [subRow] = await db.select().from(subscription).where(eq(subscription.organization_id, orgId)).limit(1)
  // Keep the ORIGINAL status across re-schedules so cancel restores it correctly.
  const prevStatus = existing?.prev_subscription_status ?? subRow?.status ?? null
  const purgeAt = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000)

  await db.transaction(async (tx) => {
    await tx.insert(tenant_deletion).values({
      organization_id: orgId,
      scheduled_purge_at: purgeAt,
      requested_by: actor.id,
      prev_subscription_status: prevStatus,
      reason: parsed.data.reason ?? null,
    }).onConflictDoUpdate({
      target: tenant_deletion.organization_id,
      set: { scheduled_purge_at: purgeAt, requested_by: actor.id, requested_at: new Date(), reason: parsed.data.reason ?? null },
    })
    // Block the tenant from using the app during the grace window.
    if (subRow) {
      await tx.update(subscription).set({ status: "cancelled", updated_at: new Date() }).where(eq(subscription.organization_id, orgId))
    }
  })

  console.warn(`[platform] tenant "${org.name}" (${orgId}) scheduled for deletion on ${purgeAt.toISOString()} by ${actor.email ?? actor.id}`)
  return NextResponse.json({ ok: true, scheduled_purge_at: purgeAt.toISOString() })
}

// Cancel a scheduled deletion and restore the tenant's previous access.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user: actor } = ctx

  const [existing] = await db.select().from(tenant_deletion).where(eq(tenant_deletion.organization_id, orgId)).limit(1)
  if (!existing) return NextResponse.json({ error: "No scheduled deletion" }, { status: 404 })

  await db.transaction(async (tx) => {
    if (existing.prev_subscription_status) {
      await tx.update(subscription)
        .set({ status: existing.prev_subscription_status, updated_at: new Date() })
        .where(eq(subscription.organization_id, orgId))
    }
    await tx.delete(tenant_deletion).where(eq(tenant_deletion.organization_id, orgId))
  })

  console.warn(`[platform] deletion cancelled for tenant ${orgId} by ${actor.email ?? actor.id}`)
  return NextResponse.json({ ok: true })
}
