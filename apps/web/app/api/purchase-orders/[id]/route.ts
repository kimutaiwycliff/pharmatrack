import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { withTenant, purchase_order, purchase_order_item, audit_log } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { zUuid } from "@/lib/api/validation"
import { poItemInput, buildPoLines } from "@/lib/purchasing/lines"
import { loadPurchaseOrder } from "@/lib/purchasing/load"
import { loadOrgProfile } from "@/lib/purchasing/orgProfile"

const patchSchema = z.object({
  action: z.enum(["send", "cancel"]).optional(),
  supplier_id: zUuid().nullable().optional(),
  expected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Replaces all lines. Only while nothing has been received yet. */
  items: z.array(poItemInput).min(1).max(500).optional(),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: ["purchasing.manage", "purchasing.receive"] })
  if ("error" in ctx) return ctx.error
  const po = await withTenant(ctx, (db) => loadPurchaseOrder(db, id, ctx.permissions.includes("cost.view")))
  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
  // Letterhead for the client-side PDF download.
  return NextResponse.json({ order: po, org: await loadOrgProfile(ctx.organizationId) })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "purchasing.manage" })
  if ("error" in ctx) return ctx.error
  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data
  const canSeeCost = ctx.permissions.includes("cost.view")

  const out = await withTenant(ctx, async (db) => {
    const [po] = await db.select().from(purchase_order).where(eq(purchase_order.id, id)).limit(1)
    if (!po) return { status: 404 as const, body: { error: "Purchase order not found" } }
    if (po.status === "received" || po.status === "cancelled") {
      return { status: 409 as const, body: { error: `This order is ${po.status} and can't be changed` } }
    }

    const set: Partial<typeof purchase_order.$inferInsert> = { updated_at: new Date() }
    if (d.supplier_id !== undefined) set.supplier_id = d.supplier_id
    if (d.expected_date !== undefined) set.expected_date = d.expected_date
    if (d.notes !== undefined) set.notes = d.notes
    if (d.action === "send") {
      if (po.status !== "draft") return { status: 409 as const, body: { error: "Only drafts can be marked as sent" } }
      set.status = "sent"
      set.sent_at = new Date()
    }
    if (d.action === "cancel") set.status = "cancelled"

    if (d.items) {
      const lines = await db.select({ received: purchase_order_item.quantity_received })
        .from(purchase_order_item).where(eq(purchase_order_item.purchase_order_id, id))
      if (lines.some((l) => l.received > 0)) {
        return { status: 409 as const, body: { error: "Lines can't be edited after a delivery has been received" } }
      }
      // Editors without cost permission get the products' current cost.
      const built = await buildPoLines(db, d.items, canSeeCost)
      await db.delete(purchase_order_item).where(eq(purchase_order_item.purchase_order_id, id))
      await db.insert(purchase_order_item).values(built.map((l) => ({ ...l, purchase_order_id: id })))
    }

    await db.update(purchase_order).set(set).where(eq(purchase_order.id, id))
    if (d.action) {
      await db.insert(audit_log).values({
        organization_id: ctx.organizationId, actor_id: ctx.userId, action: `purchase_order.${d.action}`,
        entity: "purchase_order", entity_id: id, diff: { po_number: po.po_number, from: po.status, to: set.status },
      })
    }
    return { status: 200 as const, body: { order: await loadPurchaseOrder(db, id, canSeeCost) } }
  })
  return NextResponse.json(out.body, { status: out.status })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "purchasing.manage" })
  if ("error" in ctx) return ctx.error
  const out = await withTenant(ctx, async (db) => {
    const [po] = await db.select({ status: purchase_order.status }).from(purchase_order).where(eq(purchase_order.id, id)).limit(1)
    if (!po) return { status: 404 as const, body: { error: "Purchase order not found" } }
    if (po.status !== "draft") return { status: 409 as const, body: { error: "Only drafts can be deleted — cancel a sent order instead" } }
    await db.delete(purchase_order).where(eq(purchase_order.id, id))
    return { status: 200 as const, body: { ok: true } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
