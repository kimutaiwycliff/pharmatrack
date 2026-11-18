import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { branch, withTenant } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { apiError } from "@/lib/api/errors"
import { hasAddon } from "@/lib/entitlements"

// Does this branch take payment at a cashier station (ADR-021)? The POS asks
// once per branch; `available` is false for every tenant without the add-on
// (no query at all while the kill switch is off), so their till is unchanged.
export async function GET(request: NextRequest) {
  const branchId = zUuid().safeParse(request.nextUrl.searchParams.get("branch_id"))
  if (!branchId.success) return apiError("branch_id is required")
  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)

  const off = { available: false, hold_minutes: 0, direct_sale: true }
  if (!(await hasAddon(ctx.organizationId, "cashier_station"))) return NextResponse.json(off)
  const [b] = await withTenant(ctx, (db) => db.select({
    enabled: branch.cashier_station_enabled, holdMinutes: branch.order_hold_minutes, direct: branch.order_desk_direct_sale,
  }).from(branch).where(eq(branch.id, branchId.data)).limit(1))
  if (!b?.enabled) return NextResponse.json(off)
  return NextResponse.json({ available: true, hold_minutes: b.holdMinutes, direct_sale: b.direct })
}
