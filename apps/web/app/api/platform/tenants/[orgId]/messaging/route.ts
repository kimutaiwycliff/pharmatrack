import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { audit_log, org_settings, organization } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"

// Operator only: switch a pharmacy's paid messaging add-ons on/off once it has
// paid (lib/notifications/messaging). Until switched on, the pharmacy's app
// never mentions — or sends — SMS / WhatsApp reminders.
const schema = z.object({
  sms_enabled: z.boolean().optional(),
  whatsapp_enabled: z.boolean().optional(),
}).refine((d) => d.sms_enabled !== undefined || d.whatsapp_enabled !== undefined, { message: "Nothing to change" })

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })

  const [org] = await ctx.db.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const [existing] = await ctx.db.select().from(org_settings).where(eq(org_settings.organization_id, orgId)).limit(1)
  const merged = { ...((existing?.settings ?? {}) as Record<string, unknown>), ...parsed.data }
  if (existing) await ctx.db.update(org_settings).set({ settings: merged, updated_at: new Date() }).where(eq(org_settings.organization_id, orgId))
  else await ctx.db.insert(org_settings).values({ organization_id: orgId, settings: merged })

  await ctx.db.insert(audit_log).values({
    organization_id: orgId, actor_id: ctx.user.id, action: "messaging.update",
    entity: "org_settings", entity_id: orgId, diff: parsed.data,
  })
  return NextResponse.json({ sms_enabled: merged.sms_enabled === true, whatsapp_enabled: merged.whatsapp_enabled === true })
}
