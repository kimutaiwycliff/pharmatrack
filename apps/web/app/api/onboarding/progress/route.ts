import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm"
import { dbAdmin, device, mpesa_config, org_settings, product, product_batch, sale, staff_profile } from "@pharmatrack/db"
import { setupProgress, type SetupFacts } from "@pharmatrack/core"
import { getApiContext } from "@/lib/api-auth"

// Setup guide (ADR-019): how far this pharmacy is from selling, worked out
// from its real data. Shown to owners and managers — the people who set a
// pharmacy up. Each of them can hide it for themselves.

const AUDIENCE = new Set(["owner", "manager"])

interface GuideSettings { hidden_users?: string[] }

async function facts(orgId: string): Promise<SetupFacts> {
  const db = dbAdmin()
  const count = (n: { n: number }[]) => n[0]?.n ?? 0
  const [products, priced, stocked, sales, staff, mpesa, devices, settings] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(product).where(eq(product.organization_id, orgId)),
    db.select({ n: sql<number>`count(*)::int` }).from(product).where(and(eq(product.organization_id, orgId), gt(product.selling_price, "0"))),
    db.select({ n: sql<number>`count(*)::int` }).from(product_batch).where(and(eq(product_batch.organization_id, orgId), gt(product_batch.quantity_remaining, 0))),
    db.select({ n: sql<number>`count(*)::int` }).from(sale).where(and(eq(sale.organization_id, orgId), eq(sale.status, "completed"))),
    db.select({ n: sql<number>`count(*)::int` }).from(staff_profile).where(and(eq(staff_profile.organization_id, orgId), eq(staff_profile.is_active, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(mpesa_config).where(and(eq(mpesa_config.organization_id, orgId), isNotNull(mpesa_config.verified_at))),
    db.select({ n: sql<number>`count(*)::int` }).from(device).where(and(eq(device.organization_id, orgId), isNull(device.revoked_at))),
    db.select({ settings: org_settings.settings }).from(org_settings).where(eq(org_settings.organization_id, orgId)).limit(1),
  ])
  const s = (settings[0]?.settings ?? {}) as { receipt?: { logo?: unknown }; device_lock?: { enabled?: unknown } }
  return {
    products: count(products), priced: count(priced), stocked: count(stocked), sales: count(sales),
    staff: count(staff), mpesa: count(mpesa) > 0, receiptLogo: !!s.receipt?.logo, devices: count(devices), deviceLock: s.device_lock?.enabled === true,
  }
}

async function guideSettings(orgId: string): Promise<GuideSettings> {
  const [row] = await dbAdmin().select({ settings: org_settings.settings }).from(org_settings).where(eq(org_settings.organization_id, orgId)).limit(1)
  return ((row?.settings ?? {}) as { setup_guide?: GuideSettings }).setup_guide ?? {}
}

export async function GET() {
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  const audience = AUDIENCE.has(ctx.role)
  if (!audience) return NextResponse.json({ audience: false })
  const [f, g] = await Promise.all([facts(ctx.organizationId), guideSettings(ctx.organizationId)])
  return NextResponse.json({
    audience: true,
    hidden: (g.hidden_users ?? []).includes(ctx.userId),
    progress: setupProgress(f),
  })
}

const patchSchema = z.object({ hidden: z.boolean() })

export async function PATCH(request: NextRequest) {
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  if (!AUDIENCE.has(ctx.role)) return NextResponse.json({ error: "Not available" }, { status: 403 })
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const g = await guideSettings(ctx.organizationId)
  const users = new Set(g.hidden_users ?? [])
  if (parsed.data.hidden) users.add(ctx.userId)
  else users.delete(ctx.userId)
  const next = { setup_guide: { ...g, hidden_users: [...users] } }
  await dbAdmin().insert(org_settings).values({ organization_id: ctx.organizationId, settings: next })
    .onConflictDoUpdate({
      target: org_settings.organization_id,
      set: { settings: sql`${org_settings.settings} || ${JSON.stringify(next)}::jsonb`, updated_at: new Date() },
    })
  return NextResponse.json({ hidden: parsed.data.hidden })
}
