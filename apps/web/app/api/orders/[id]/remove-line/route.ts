import { NextRequest, NextResponse } from "next/server"
import { counter_order, withTenant } from "@pharmatrack/db"
import { eq } from "drizzle-orm"
import { zUuid } from "@/lib/api/validation"
import { apiError } from "@/lib/api/errors"
import { branchAllowed, orderContext } from "@/lib/cashier-station/guard"
import { orderErrorResponse, removeLine } from "@/lib/cashier-station/orders"

// The customer no longer wants a line: remove it, releasing its stock (ADR-021).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = zUuid().safeParse((await params).id)
  if (!id.success) return apiError("Order not found", 404)
  const g = await orderContext(["orders.collect"])
  if ("error" in g) return g.error
  const { ctx, actor } = g
  const [o] = await withTenant(ctx, (db) => db.select({ branch_id: counter_order.branch_id })
    .from(counter_order).where(eq(counter_order.id, id.data)).limit(1))
  if (!o || !branchAllowed(ctx, o.branch_id)) return apiError("Order not found", 404)
  const body = zUuid().safeParse(((await request.json().catch(() => ({}))) as { line_id?: unknown }).line_id)
  if (!body.success) return apiError("line_id is required")
  try {
    const order = await withTenant(ctx, (db) => removeLine(db, actor, id.data, body.data))
    return NextResponse.json({ order })
  } catch (e) {
    const res = orderErrorResponse(e)
    if (res) return res
    throw e
  }
}
