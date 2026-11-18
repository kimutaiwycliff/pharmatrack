import { NextRequest, NextResponse } from "next/server"
import { withTenant } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { apiError } from "@/lib/api/errors"
import { branchAllowed, orderContext } from "@/lib/cashier-station/guard"
import { getOrder } from "@/lib/cashier-station/orders"

// One cashier-station order with its lines (ADR-021). The cashier sees any
// order in their branch; an order desk only its own.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = zUuid().safeParse((await params).id)
  if (!id.success) return apiError("Order not found", 404)
  const g = await orderContext(["orders.collect", "orders.send"])
  if ("error" in g) return g.error
  const { ctx } = g
  const found = await withTenant(ctx, (db) => getOrder(db, { id: id.data }))
  if (!found || !branchAllowed(ctx, found.row.branch_id) ||
      (!ctx.permissions.includes("orders.collect") && found.row.sent_by !== ctx.userId)) {
    return apiError("Order not found", 404)
  }
  return NextResponse.json({ order: found.order })
}
