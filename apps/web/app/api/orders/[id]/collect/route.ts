import { NextRequest, NextResponse } from "next/server"
import { counter_order, withTenant } from "@pharmatrack/db"
import { eq } from "drizzle-orm"
import { zUuid } from "@/lib/api/validation"
import { apiError, zodErrorResponse } from "@/lib/api/errors"
import { branchAllowed, orderContext } from "@/lib/cashier-station/guard"
import { collectOrder, collectSchema, orderErrorResponse } from "@/lib/cashier-station/orders"

// Take payment for an order and hand the goods over (ADR-021). Records the
// sale at the prices fixed when the order was sent, on the cashier's shift.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = zUuid().safeParse((await params).id)
  if (!id.success) return apiError("Order not found", 404)
  const g = await orderContext(["orders.collect"])
  if ("error" in g) return g.error
  const { ctx, actor } = g
  const [o] = await withTenant(ctx, (db) => db.select({ branch_id: counter_order.branch_id })
    .from(counter_order).where(eq(counter_order.id, id.data)).limit(1))
  if (!o || !branchAllowed(ctx, o.branch_id)) return apiError("Order not found", 404)
  const parsed = collectSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)
  try {
    const out = await withTenant(ctx, (db) => collectOrder(db, actor, id.data, parsed.data))
    return NextResponse.json(out, { status: 201 })
  } catch (e) {
    const res = orderErrorResponse(e)
    if (res) return res
    throw e
  }
}
