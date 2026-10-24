import { NextRequest, NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { audit_log, org_settings, organization } from "@pharmatrack/db"
import { deviceLockFrom } from "@pharmatrack/core"
import { getPlatformContext } from "@/lib/platform"

// Operator recovery (ADR-018): switch a pharmacy's "Only approved devices"
// lock OFF — e.g. the owner is stuck with no approved device and no PIN set.
// Turning it on stays the owner's decision, so there's deliberately no "on".
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const [org] = await ctx.db.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  const [row] = await ctx.db.select({ settings: org_settings.settings }).from(org_settings).where(eq(org_settings.organization_id, orgId)).limit(1)
  const before = deviceLockFrom(row?.settings)
  if (!before.enabled) return NextResponse.json({ device_lock: before })

  const after = { ...before, enabled: false }
  await ctx.db.update(org_settings)
    .set({ settings: sql`${org_settings.settings} || ${JSON.stringify({ device_lock: after })}::jsonb`, updated_at: new Date() })
    .where(eq(org_settings.organization_id, orgId))
  await ctx.db.insert(audit_log).values({
    organization_id: orgId, actor_id: ctx.user.id, action: "settings.device_lock", entity: "organization", entity_id: orgId,
    diff: { before, after, by: "platform" },
  })
  return NextResponse.json({ device_lock: after })
}
