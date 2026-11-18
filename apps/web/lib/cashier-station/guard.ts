import "server-only"
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { branch, dbAdmin, withTenant } from "@pharmatrack/db"
import type { Capability } from "@pharmatrack/core"
import { getTenantContext, requireActiveSubscription, type TenantContext } from "@/lib/auth/helpers"
import { apiError } from "@/lib/api/errors"
import { hasAddon, requireAddonApi } from "@/lib/entitlements"
import type { SaleActor } from "@/lib/sales/create-sale"

// Who may use the cashier station routes (ADR-021).
//
// Creating orders (send, resend) needs the add-on AND the branch switched on.
// Working on existing orders (queue, view, collect, remove a line, cancel)
// needs only the permission: if the add-on lapses, orders already sent can
// still be paid for, so no customer is left standing at the counter.

type Guarded = { ctx: TenantContext; actor: SaleActor } | { error: NextResponse }

export async function orderContext(anyOf: Capability[]): Promise<Guarded> {
  const ctx = await getTenantContext()
  if (!ctx) return { error: apiError("Unauthorized", 401) }
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return { error: subErr }
  if (!anyOf.some((c) => ctx.permissions.includes(c))) return { error: apiError("You don't have permission to do that", 403) }
  return { ctx, actor: { organizationId: ctx.organizationId, userId: ctx.userId, mayDiscount: ctx.permissions.includes("pos.discount") } }
}

/** Branch-locked staff only reach their own branch. */
export function branchAllowed(ctx: TenantContext, branchId: string): boolean {
  return !ctx.branchLocked || ctx.branchId === branchId
}

/** For send/resend: the add-on is active and this branch has it switched on. */
export async function stationBranch(ctx: TenantContext, branchId: string) {
  const addonErr = await requireAddonApi(ctx.organizationId, "cashier_station")
  if (addonErr) return { error: addonErr }
  if (!branchAllowed(ctx, branchId)) return { error: apiError("You can't send orders for that branch", 403) }
  const [b] = await withTenant(ctx, (db) => db.select({
    enabled: branch.cashier_station_enabled, holdMinutes: branch.order_hold_minutes,
  }).from(branch).where(eq(branch.id, branchId)).limit(1))
  if (!b) return { error: apiError("Branch not found", 404) }
  if (!b.enabled) {
    return { error: NextResponse.json({ error: "The cashier station is off for this branch", code: "station_off" }, { status: 403 }) }
  }
  return { holdMinutes: b.holdMinutes }
}

/** POST /api/sales: in a branch with the station on, order-desk staff send
 *  orders to the cashier instead of checking out themselves — unless the
 *  branch allows direct sales. Offline sales are always accepted (a sale is
 *  never lost); they sync with an offline_reference. With the kill switch
 *  off, this costs no query at all. */
export async function mustUseCashier(ctx: TenantContext, branchId: string, offlineReference: string | null | undefined): Promise<boolean> {
  if (offlineReference) return false
  if (ctx.permissions.includes("orders.collect")) return false
  if (!(await hasAddon(ctx.organizationId, "cashier_station"))) return false
  const [b] = await dbAdmin().select({ enabled: branch.cashier_station_enabled, direct: branch.order_desk_direct_sale })
    .from(branch).where(and(eq(branch.id, branchId), eq(branch.organization_id, ctx.organizationId))).limit(1)
  return !!b?.enabled && !b.direct
}
