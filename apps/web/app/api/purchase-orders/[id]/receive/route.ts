import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, sql } from "drizzle-orm"
import { withTenant, purchase_order, purchase_order_item, product_batch, product, audit_log } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { zUuid } from "@/lib/api/validation"
import { loadPurchaseOrder } from "@/lib/purchasing/load"
import { invalidateBarcodeCache } from "@/lib/products/barcodeCache"

const batchSchema = z.object({
  batch_number: z.string().trim().min(1).max(80),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().positive().max(1_000_000), // packs
  unit_cost: z.number().nonnegative().nullable().optional(), // per pack
})
const receiveSchema = z.object({
  lines: z.array(z.object({ item_id: zUuid(), batches: z.array(batchSchema).min(1).max(20) })).min(1).max(500),
  /** Mark the order fully received even if some lines came short. */
  close: z.boolean().optional(),
})

class ReceiveError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const nairobiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date())

// POST /api/purchase-orders/:id/receive — check in a delivery against the PO.
// Each batch becomes a product_batch (quantities converted packs → base units,
// cost per pack → per base unit) linked to its PO line, all in one transaction.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "purchasing.receive" })
  if ("error" in ctx) return ctx.error
  const parsed = receiveSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { lines, close } = parsed.data
  const canSeeCost = ctx.permissions.includes("cost.view")
  const today = nairobiToday()

  try {
    const out = await withTenant(ctx, async (db) => {
      const [po] = await db.select().from(purchase_order).where(eq(purchase_order.id, id)).limit(1)
      if (!po) throw new ReceiveError(404, "Purchase order not found")
      if (po.status === "received" || po.status === "cancelled") throw new ReceiveError(409, `This order is already ${po.status}`)

      const items = await db.select().from(purchase_order_item).where(eq(purchase_order_item.purchase_order_id, id))
      const itemMap = new Map(items.map((i) => [i.id, i]))
      const codes: Array<string | null> = []
      let batchCount = 0

      for (const line of lines) {
        const item = itemMap.get(line.item_id)
        if (!item) throw new ReceiveError(400, "A line doesn't belong to this order")
        if (!item.product_id) throw new ReceiveError(409, `${item.product_name} was deleted — it can't be received`)
        let packs = 0
        for (const b of line.batches) {
          if (b.expiry_date <= today) throw new ReceiveError(400, `${item.product_name}: batch ${b.batch_number} is already expired`)
          // Invoice cost per pack as entered; otherwise the PO's expected cost
          // (so staff who can't see costs never have to type one).
          const cost = b.unit_cost ?? (item.unit_cost == null ? null : Number(item.unit_cost))
          await db.insert(product_batch).values({
            organization_id: ctx.organizationId,
            product_id: item.product_id,
            branch_id: po.branch_id,
            supplier_id: po.supplier_id,
            batch_number: b.batch_number,
            expiry_date: b.expiry_date,
            quantity_received: b.quantity * item.units_per_pack,
            quantity_remaining: b.quantity * item.units_per_pack,
            cost_price: cost == null ? null : (Math.round((cost / item.units_per_pack) * 100) / 100).toFixed(2),
            received_by: ctx.userId,
            purchase_order_item_id: item.id,
          })
          packs += b.quantity
          batchCount++
        }
        await db.update(purchase_order_item)
          .set({ quantity_received: sql`${purchase_order_item.quantity_received} + ${packs}` })
          .where(eq(purchase_order_item.id, item.id))
        item.quantity_received += packs
        const [p] = await db.select({ gtin: product.gtin, raw: product.barcode_raw }).from(product).where(eq(product.id, item.product_id)).limit(1)
        codes.push(p?.gtin ?? null, p?.raw ?? null)
      }

      const complete = close || items.every((i) => i.quantity_received >= i.quantity_ordered)
      await db.update(purchase_order).set({
        status: complete ? "received" : "partially_received",
        received_at: complete ? new Date() : null,
        sent_at: po.sent_at ?? new Date(),
        updated_at: new Date(),
      }).where(eq(purchase_order.id, id))

      await db.insert(audit_log).values({
        organization_id: ctx.organizationId, actor_id: ctx.userId, action: "purchase_order.receive",
        entity: "purchase_order", entity_id: id,
        diff: { po_number: po.po_number, batches: batchCount, closed: complete, lines: lines.map((l) => ({ item_id: l.item_id, batches: l.batches })) },
      })
      return { codes, batchCount, complete, order: await loadPurchaseOrder(db, id, canSeeCost) }
    })
    await invalidateBarcodeCache(ctx.organizationId, out.codes)
    return NextResponse.json({ order: out.order, batches: out.batchCount, complete: out.complete })
  } catch (err) {
    if (err instanceof ReceiveError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
