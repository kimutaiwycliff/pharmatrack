import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { withTenant, sync_issue, device, sale, product, branch } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { resolveBranchScope } from "@/lib/inventory/aggregate"

// Manager inbox for things offline devices did that need a human look.
export async function GET(request: NextRequest) {
  const ctx = await getApiContext({ permission: "devices.manage" })
  if ("error" in ctx) return ctx.error
  const sp = request.nextUrl.searchParams
  const status = sp.get("status") === "resolved" ? "resolved" : "open"
  const branchId = resolveBranchScope(ctx, sp.get("branch_id"))
  return withTenant(ctx, async (db) => {
    const rows = await db.select({
      i: sync_issue, device_name: device.name, device_code: device.device_code, receipt: sale.receipt_number,
      product_name: product.name, branch_name: branch.name,
    }).from(sync_issue)
      .leftJoin(device, eq(device.id, sync_issue.device_id))
      .leftJoin(sale, eq(sale.id, sync_issue.sale_id))
      .leftJoin(product, eq(product.id, sync_issue.product_id))
      .leftJoin(branch, eq(branch.id, sync_issue.branch_id))
      .where(and(eq(sync_issue.status, status), branchId ? eq(sync_issue.branch_id, branchId) : undefined))
      .orderBy(desc(sync_issue.created_at)).limit(200)
    return NextResponse.json({
      issues: rows.map(({ i, ...r }) => ({
        id: i.id, kind: i.kind, status: i.status, details: i.details, created_at: i.created_at,
        sale_id: i.sale_id, shift_id: i.shift_id, product_id: i.product_id,
        resolved_at: i.resolved_at, resolution_note: i.resolution_note, ...r,
      })),
    })
  })
}
