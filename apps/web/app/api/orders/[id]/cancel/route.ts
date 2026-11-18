import { NextRequest, NextResponse } from "next/server"
import { counter_order, withTenant } from "@pharmatrack/db"
import { eq } from "drizzle-orm"
import { zUuid } from "@/lib/api/validation"
import { apiError } from "@/lib/api/errors"
import { branchAllowed, orderContext } from "@/lib/cashier-station/guard"
import { cancelOrder, orderErrorResponse } from "@/lib/cashier-station/orders"

// Cancel an open order, releasing its stock (ADR-021). An order desk can
// cancel its own orders; whoever runs the station can cancel any.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = zUuid().safeParse((await params).id)
  if (!id.success) return apiError("Order not found", 404)
  const g = await orderContext(["orders.collect", "orders.send"])
  if ("error" in g) return g.error
  const { ctx, actor } = g
  const [o] = await withTenant(ctx, (db) => db.select({ branch_id: counter_order.branch_id })
    .from(counter_order).where(eq(counter_order.id, id.data)).limit(1))
  if (!o || !branchAllowed(ctx, o.branch_id)) return apiError("Order not found", 404)
  try {
    const order = await withTenant(ctx, (db) => cancelOrder(db, actor, id.data, ctx.permissions.includes("orders.collect")))
    return NextResponse.json({ order })
  } catch (e) {
    const res = orderErrorResponse(e)
    if (res) return res
    throw e
  }
}
