import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { asc, eq } from "drizzle-orm"
import { audit_log, branch, withTenant } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { zUuid } from "@/lib/api/validation"
import { requireAddonApi } from "@/lib/entitlements"

// Which branches pay at a cashier station (ADR-021). The add-on is paid per
// pharmacy and switched on per branch. Writes go through RLS (owner/manager).

const patchSchema = z.object({
  branch_id: zUuid(),
  enabled: z.boolean().optional(),
  hold_minutes: z.number().int().min(5).max(240).optional(),
  direct_sale: z.boolean().optional(),
})

const cols = {
  id: branch.id, name: branch.name, is_active: branch.is_active,
  enabled: branch.cashier_station_enabled, hold_minutes: branch.order_hold_minutes, direct_sale: branch.order_desk_direct_sale,
}

export async function GET() {
  const ctx = await getApiContext({ permission: ["branches.manage", "settings.organization", "billing.manage"] })
  if ("error" in ctx) return ctx.error
  const branches = await withTenant(ctx, (db) => db.select(cols).from(branch).orderBy(asc(branch.created_at)))
  return NextResponse.json({ branches })
}

export async function PATCH(request: NextRequest) {
  const ctx = await getApiContext({ permission: ["branches.manage", "settings.organization"] })
  if ("error" in ctx) return ctx.error
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { branch_id, enabled, hold_minutes, direct_sale } = parsed.data
  // Switching a branch on needs the add-on; switching off never does.
  if (enabled !== false) {
    const locked = await requireAddonApi(ctx.organizationId, "cashier_station")
    if (locked) return locked
  }
  const set = {
    ...(enabled !== undefined && { cashier_station_enabled: enabled }),
    ...(hold_minutes !== undefined && { order_hold_minutes: hold_minutes }),
    ...(direct_sale !== undefined && { order_desk_direct_sale: direct_sale }),
  }
  if (Object.keys(set).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
  const row = await withTenant(ctx, async (db) => {
    const [b] = await db.update(branch).set(set).where(eq(branch.id, branch_id)).returning(cols)
    if (b) {
      await db.insert(audit_log).values({
        organization_id: ctx.organizationId, actor_id: ctx.userId, action: "branch.cashier_station",
        entity: "branch", entity_id: branch_id, diff: set,
      })
    }
    return b
  })
  if (!row) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  return NextResponse.json({ branch: row })
}
