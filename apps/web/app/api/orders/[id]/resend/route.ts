import { NextRequest, NextResponse } from "next/server"
import { counter_order, withTenant } from "@pharmatrack/db"
import { eq } from "drizzle-orm"
import { zUuid } from "@/lib/api/validation"
import { apiError } from "@/lib/api/errors"
import { branchAllowed, orderContext, stationBranch } from "@/lib/cashier-station/guard"
import { orderErrorResponse, resendOrder } from "@/lib/cashier-station/orders"

// Send an expired order again, re-priced and stock-checked (ADR-021). Like a
// new send, it needs the add-on and the branch switched on.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = zUuid().safeParse((await params).id)
  if (!id.success) return apiError("Order not found", 404)
  const g = await orderContext(["orders.send", "orders.collect"])
  if ("error" in g) return g.error
  const { ctx, actor } = g
  const [o] = await withTenant(ctx, (db) => db.select({ branch_id: counter_order.branch_id })
    .from(counter_order).where(eq(counter_order.id, id.data)).limit(1))
  if (!o || !branchAllowed(ctx, o.branch_id)) return apiError("Order not found", 404)
  const station = await stationBranch(ctx, o.branch_id)
  if ("error" in station) return station.error
  try {
    const out = await withTenant(ctx, (db) =>
      resendOrder(db, actor, id.data, station.holdMinutes, ctx.permissions.includes("orders.collect")))
    return NextResponse.json(out, { status: 201 })
  } catch (e) {
    const res = orderErrorResponse(e)
    if (res) return res
    throw e
  }
}
