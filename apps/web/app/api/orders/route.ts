import { NextRequest, NextResponse } from "next/server"
import { withTenant } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { apiError, zodErrorResponse } from "@/lib/api/errors"
import { branchAllowed, orderContext, stationBranch } from "@/lib/cashier-station/guard"
import { parseOrderLabel } from "@/lib/cashier-station/label"
import { getOrder, listOrders, orderErrorResponse, sendOrder, sendOrderSchema } from "@/lib/cashier-station/orders"

// Cashier station (ADR-021).
// GET ?branch_id&view=queue  — open orders for the cashier (orders.collect)
// GET ?branch_id&view=mine   — this desk's orders today (orders.send)
// GET ?branch_id&number=A-047 — one of today's orders, for a typed number
// POST — send an order to the cashier (needs the add-on + the branch switched on)

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const branchId = zUuid().safeParse(sp.get("branch_id"))
  if (!branchId.success) return apiError("branch_id is required")
  const g = await orderContext(["orders.collect", "orders.send"])
  if ("error" in g) return g.error
  const { ctx } = g
  if (!branchAllowed(ctx, branchId.data)) return apiError("Not your branch", 403)
  const mayCollect = ctx.permissions.includes("orders.collect")

  const numberText = sp.get("number")
  if (numberText) {
    const n = parseOrderLabel(numberText)
    if (n == null) return apiError("That isn't an order number")
    const found = await withTenant(ctx, (db) => getOrder(db, { branchId: branchId.data, number: n }))
    if (!found || (!mayCollect && found.row.sent_by !== ctx.userId)) return apiError("Order not found", 404)
    return NextResponse.json({ order: found.order })
  }

  const view = sp.get("view") === "queue" ? "queue" : "mine"
  if (view === "queue" && !mayCollect) return apiError("You don't run the cashier station", 403)
  const orders = await withTenant(ctx, (db) => listOrders(db, { branchId: branchId.data, view, userId: ctx.userId }))
  return NextResponse.json({ orders })
}

export async function POST(request: NextRequest) {
  const g = await orderContext(["orders.send"])
  if ("error" in g) return g.error
  if (!g.ctx.permissions.includes("pos.sell")) return apiError("You don't have permission to sell", 403)
  const parsed = sendOrderSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)

  const station = await stationBranch(g.ctx, parsed.data.branch_id)
  if ("error" in station) return station.error

  try {
    const out = await withTenant(g.ctx, (db) => sendOrder(db, g.actor, parsed.data, station.holdMinutes))
    return NextResponse.json(out, { status: out.deduped ? 200 : 201 })
  } catch (e) {
    const res = orderErrorResponse(e)
    if (res) return res
    throw e
  }
}
