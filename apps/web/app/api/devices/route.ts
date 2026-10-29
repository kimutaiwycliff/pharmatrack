import { NextResponse } from "next/server"
import { asc, eq, sql } from "drizzle-orm"
import { withTenant, device, branch, device_stock_allocation, sync_issue } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"

// Settings → Devices: registered phones/tablets with their sync health.
export async function GET() {
  const ctx = await getApiContext({ permission: "devices.manage" })
  if ("error" in ctx) return ctx.error
  return withTenant(ctx, async (db) => {
    const rows = await db.select({
      d: device, branch_name: branch.name,
      held: sql<number>`(select coalesce(sum(${device_stock_allocation.quantity}),0)::int from ${device_stock_allocation} where ${device_stock_allocation.device_id} = ${device.id} and ${device_stock_allocation.reserved_until} > now())`,
      open_issues: sql<number>`(select count(*)::int from ${sync_issue} where ${sync_issue.device_id} = ${device.id} and ${sync_issue.status} = 'open')`,
    }).from(device).leftJoin(branch, eq(branch.id, device.branch_id)).orderBy(asc(device.created_at))
    return NextResponse.json({
      devices: rows.map(({ d, branch_name, held, open_issues }) => ({
        id: d.id, name: d.name, code: d.device_code, branch_id: d.branch_id, branch_name,
        platform: d.platform, app_version: d.app_version, purpose: d.purpose, approved_until: d.approved_until,
        allocation_percent: d.allocation_percent == null ? null : Number(d.allocation_percent),
        last_seen_at: d.last_seen_at, last_sync_at: d.last_sync_at, revoked_at: d.revoked_at, created_at: d.created_at,
        units_held: held, open_issues,
      })),
    })
  })
}
