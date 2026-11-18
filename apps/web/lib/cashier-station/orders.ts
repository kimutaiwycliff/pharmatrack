import { NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm"
import { counter_order, counter_order_item, shift, user, type DrizzleDB } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import {
  assertStock, createSale, priceCart, saleErrorResponse, saleSchema,
  type SaleActor, type SaleData,
} from "@/lib/sales/create-sale"
import { orderLabel } from "./label"

// Cashier station orders (ADR-021). An order desk sends the customer's cart;
// it is priced and its stock held (counter_order_item) until a cashier
// collects it — which records the sale through createSale(), at the prices
// fixed when it was sent — or it is cancelled or expires. All functions run
// inside the caller's `withTenant` transaction (RLS).

export type OrderErrorCode =
  | "order_not_found" | "order_not_open" | "order_expired" | "order_not_expired"
  | "line_not_found" | "last_line" | "line_product_gone" | "shift_required" | "not_yours"

export class OrderError extends Error {
  constructor(public code: OrderErrorCode, message: string, public status: number) { super(message) }
}

export const sendOrderSchema = z.object({
  branch_id: zUuid(),
  items: saleSchema.shape.items,
  discount_amount: z.number().nonnegative().default(0),
  customer_name: z.string().max(120).nullable().default(null),
  customer_phone: z.string().max(30).nullable().default(null),
  // Retrying a send (lost response) returns the same order.
  client_reference: z.string().min(8).max(100).nullable().optional(),
})
export type SendOrderInput = z.infer<typeof sendOrderSchema>

export const collectSchema = z.object({
  shift_id: zUuid(),
  payment_method: z.enum(["cash", "mpesa", "card", "split"]),
  amount_tendered: z.number().nonnegative().nullable().default(null),
  change_given: z.number().nonnegative().nullable().default(null),
  mpesa_checkout_request_id: z.string().min(1).max(100).nullable().optional(),
  cash_amount: z.number().nonnegative().nullable().optional(),
  mpesa_amount: z.number().nonnegative().nullable().optional(),
  // Card terminal approval code (no card API — the cashier types it).
  card_reference: z.string().trim().min(2).max(40).nullable().optional(),
}).refine((d) => d.payment_method !== "card" || !!d.card_reference, {
  message: "Enter the card approval code", path: ["card_reference"],
})
export type CollectInput = z.infer<typeof collectSchema>

type OrderRow = typeof counter_order.$inferSelect
type LineRow = typeof counter_order_item.$inferSelect

const money = (n: number) => Math.round(n * 100) / 100

function orderOut(o: OrderRow, extra: { sent_by_name?: string | null; lines?: LineRow[]; line_count?: number } = {}) {
  const expired = o.status === "expired" || (o.status === "awaiting_payment" && o.expires_at.getTime() <= Date.now())
  return {
    id: o.id, branch_id: o.branch_id, number: o.number, label: orderLabel(o.number),
    status: expired ? "expired" as const : o.status,
    sent_by: o.sent_by, sent_by_name: extra.sent_by_name ?? null,
    collected_by: o.collected_by, sale_id: o.sale_id,
    subtotal: Number(o.subtotal), discount_amount: Number(o.discount_amount), total_amount: Number(o.total_amount),
    customer_name: o.customer_name, customer_phone: o.customer_phone,
    expires_at: o.expires_at.toISOString(), created_at: o.created_at.toISOString(),
    line_count: extra.line_count ?? extra.lines?.length,
    lines: extra.lines?.map((l) => ({
      id: l.id, product_id: l.product_id, product_name: l.product_name, product_strength: l.product_strength,
      base_unit: l.base_unit, is_controlled: l.is_controlled, quantity: l.quantity,
      pack_size_id: l.pack_size_id, unit_count: l.unit_count,
      unit_price: Number(l.unit_price), discount_percent: Number(l.discount_percent), line_total: Number(l.line_total),
    })),
  }
}
export type OrderOut = ReturnType<typeof orderOut>

async function activeLines(db: DrizzleDB, orderId: string) {
  return db.select().from(counter_order_item)
    .where(and(eq(counter_order_item.order_id, orderId), isNull(counter_order_item.removed_at)))
    .orderBy(asc(counter_order_item.id))
}

/** Send an order to the cashier: price it, hold its stock, number it. */
export async function sendOrder(db: DrizzleDB, actor: SaleActor, input: SendOrderInput, holdMinutes: number) {
  if (input.client_reference) {
    const [dupe] = await db.select().from(counter_order).where(eq(counter_order.client_reference, input.client_reference)).limit(1)
    if (dupe) return { order: orderOut(dupe, { lines: await activeLines(db, dupe.id) }), deduped: true }
  }

  const { itemPricing, subtotal, discountAmount, totalAmount } =
    await priceCart(db, input.items, input.discount_amount, actor.mayDiscount)
  // Takes the branch allocation lock, which also serialises numbering below.
  await assertStock(db, input.branch_id, input.items)

  const today = sql`(now() at time zone 'Africa/Nairobi')::date`
  const [next] = (await db.execute(sql`
    select coalesce(max(${counter_order.number}), 0) + 1 as n from ${counter_order}
    where ${counter_order.branch_id} = ${input.branch_id} and ${counter_order.business_date} = ${today}
  `)) as unknown as Array<{ n: number }>

  const [order] = await db.insert(counter_order).values({
    organization_id: actor.organizationId,
    branch_id: input.branch_id,
    business_date: today as unknown as string,
    number: Number(next!.n),
    sent_by: actor.userId,
    subtotal: String(subtotal),
    discount_amount: String(discountAmount),
    total_amount: String(totalAmount),
    customer_name: input.customer_name,
    customer_phone: input.customer_phone,
    client_reference: input.client_reference ?? null,
    expires_at: sql`now() + make_interval(mins => ${holdMinutes})` as unknown as Date,
  }).returning()

  const lines = await db.insert(counter_order_item).values(input.items.map((item, idx) => ({
    order_id: order!.id,
    organization_id: actor.organizationId,
    product_id: item.product_id,
    product_name: item.product_name,
    product_strength: item.product_strength,
    base_unit: item.base_unit,
    is_controlled: item.is_controlled,
    quantity: item.quantity,
    pack_size_id: item.sell_unit?.pack_size_id ?? null,
    unit_count: item.sell_unit?.unit_count ?? null,
    unit_price: String(itemPricing[idx]!.unitPrice),
    discount_percent: String(itemPricing[idx]!.discountPercent),
    line_total: String(itemPricing[idx]!.lineTotal),
  }))).returning()

  return { order: orderOut(order!, { lines }), deduped: false }
}

/** The cashier's queue (open, not expired) or one desk's orders today. */
export async function listOrders(db: DrizzleDB, opts: { branchId: string; view: "queue" | "mine"; userId: string }) {
  const where = opts.view === "queue"
    ? and(eq(counter_order.branch_id, opts.branchId), eq(counter_order.status, "awaiting_payment"), gt(counter_order.expires_at, sql`now()`))
    : and(eq(counter_order.branch_id, opts.branchId), eq(counter_order.sent_by, opts.userId),
        eq(counter_order.business_date, sql`(now() at time zone 'Africa/Nairobi')::date`))
  const rows = await db.select({ o: counter_order, sent_by_name: user.name }).from(counter_order)
    .leftJoin(user, eq(user.id, counter_order.sent_by))
    .where(where)
    .orderBy(opts.view === "queue" ? asc(counter_order.created_at) : desc(counter_order.created_at))
    .limit(opts.view === "queue" ? 200 : 30)
  const ids = rows.map((r) => r.o.id)
  const counts = new Map<string, number>()
  if (ids.length > 0) {
    const c = await db.select({ id: counter_order_item.order_id, n: sql<number>`count(*)::int` }).from(counter_order_item)
      .where(and(inArray(counter_order_item.order_id, ids), isNull(counter_order_item.removed_at)))
      .groupBy(counter_order_item.order_id)
    for (const r of c) counts.set(r.id, r.n)
  }
  return rows.map((r) => orderOut(r.o, { sent_by_name: r.sent_by_name, line_count: counts.get(r.o.id) ?? 0 }))
}

/** One order with its lines, by id or by today's number in a branch. */
export async function getOrder(db: DrizzleDB, key: { id: string } | { branchId: string; number: number }) {
  const where = "id" in key
    ? eq(counter_order.id, key.id)
    : and(eq(counter_order.branch_id, key.branchId), eq(counter_order.number, key.number),
        eq(counter_order.business_date, sql`(now() at time zone 'Africa/Nairobi')::date`))
  const [row] = await db.select({ o: counter_order, sent_by_name: user.name }).from(counter_order)
    .leftJoin(user, eq(user.id, counter_order.sent_by)).where(where).limit(1)
  if (!row) return null
  return { row: row.o, order: orderOut(row.o, { sent_by_name: row.sent_by_name, lines: await activeLines(db, row.o.id) }) }
}

async function openOrderOrThrow(db: DrizzleDB, orderId: string) {
  const [o] = await db.select().from(counter_order).where(eq(counter_order.id, orderId)).for("update").limit(1)
  if (!o) throw new OrderError("order_not_found", "Order not found", 404)
  if (o.status !== "awaiting_payment") throw notOpen(o)
  if (o.expires_at.getTime() <= Date.now()) throw new OrderError("order_expired", `Order ${orderLabel(o.number)} has expired — send it again`, 409)
  return o
}

function notOpen(o: OrderRow) {
  const what = o.status === "paid" ? "already paid" : o.status === "cancelled" ? "cancelled" : "expired"
  return new OrderError(o.status === "expired" ? "order_expired" : "order_not_open", `Order ${orderLabel(o.number)} is ${what}`, 409)
}

/** Take payment for an order and hand the goods over: the sale is recorded at
 *  the prices fixed when it was sent, and the order becomes paid. The row lock
 *  makes a second cashier collecting the same order wait, then get a 409. */
export async function collectOrder(db: DrizzleDB, actor: SaleActor, orderId: string, pay: CollectInput) {
  const o = await openOrderOrThrow(db, orderId)

  const [open] = await db.select({ id: shift.id }).from(shift).where(and(
    eq(shift.id, pay.shift_id), eq(shift.cashier_id, actor.userId), eq(shift.branch_id, o.branch_id), isNull(shift.closed_at),
  )).limit(1)
  if (!open) throw new OrderError("shift_required", "Clock in at the cashier station before taking payment", 409)

  const lines = await activeLines(db, o.id)
  const gone = lines.find((l) => !l.product_id)
  if (gone) throw new OrderError("line_product_gone", `${gone.product_name} was deleted — remove it from the order`, 409)

  const data: SaleData = {
    branch_id: o.branch_id,
    shift_id: pay.shift_id,
    items: lines.map((l) => ({
      product_id: l.product_id!, product_name: l.product_name, product_strength: l.product_strength,
      quantity: l.quantity, unit_price: Number(l.unit_price), discount_percent: Number(l.discount_percent),
      line_total: Number(l.line_total), base_unit: l.base_unit, is_controlled: l.is_controlled,
      sell_unit: l.pack_size_id && l.unit_count ? { pack_size_id: l.pack_size_id, unit_count: l.unit_count } : null,
    })),
    discount_amount: Number(o.discount_amount),
    payment_method: pay.payment_method,
    amount_tendered: pay.amount_tendered,
    change_given: pay.change_given,
    mpesa_reference: null,
    mpesa_checkout_request_id: pay.mpesa_checkout_request_id ?? null,
    cash_amount: pay.cash_amount ?? null,
    mpesa_amount: pay.mpesa_amount ?? null,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    card_reference: pay.card_reference ?? null,
  }
  const out = await createSale(db, actor, data, {
    locked: {
      lines: lines.map((l) => ({ unitPrice: Number(l.unit_price), discountPercent: Number(l.discount_percent) })),
      discountAmount: Number(o.discount_amount),
    },
    counterOrderId: o.id,
    soldBy: o.sent_by,
  })

  const [paid] = await db.update(counter_order)
    .set({ status: "paid", collected_by: actor.userId, sale_id: out.sale.id ?? null, updated_at: new Date() })
    .where(and(eq(counter_order.id, o.id), eq(counter_order.status, "awaiting_payment")))
    .returning()
  return { ...out, order: orderOut(paid!, { lines }) }
}

/** The customer no longer wants a line: drop it and release its stock. The
 *  cart discount shrinks in proportion. An order keeps at least one line. */
export async function removeLine(db: DrizzleDB, actor: SaleActor, orderId: string, lineId: string) {
  const o = await openOrderOrThrow(db, orderId)
  const lines = await activeLines(db, o.id)
  const line = lines.find((l) => l.id === lineId)
  if (!line) throw new OrderError("line_not_found", "That line isn't on the order", 404)
  if (lines.length <= 1) throw new OrderError("last_line", "That's the only line — cancel the order instead", 409)

  await db.update(counter_order_item).set({ removed_at: new Date(), removed_by: actor.userId })
    .where(eq(counter_order_item.id, line.id))
  const left = lines.filter((l) => l.id !== line.id)
  const subtotal = money(left.reduce((s, l) => s + Number(l.line_total), 0))
  const oldSubtotal = Number(o.subtotal)
  const discount = oldSubtotal > 0 ? money(Number(o.discount_amount) * subtotal / oldSubtotal) : 0
  const [row] = await db.update(counter_order).set({
    subtotal: String(subtotal), discount_amount: String(discount),
    total_amount: String(Math.max(0, money(subtotal - discount))), updated_at: new Date(),
  }).where(eq(counter_order.id, o.id)).returning()
  return orderOut(row!, { lines: left })
}

/** Cancel an open order (its sender, or anyone who runs the station). */
export async function cancelOrder(db: DrizzleDB, actor: SaleActor, orderId: string, mayCancelAny: boolean) {
  const [o] = await db.select().from(counter_order).where(eq(counter_order.id, orderId)).for("update").limit(1)
  if (!o) throw new OrderError("order_not_found", "Order not found", 404)
  if (!mayCancelAny && o.sent_by !== actor.userId) throw new OrderError("not_yours", "You can only cancel orders you sent", 403)
  if (o.status !== "awaiting_payment") throw notOpen(o)
  const [row] = await db.update(counter_order)
    .set({ status: "cancelled", cancelled_by: actor.userId, updated_at: new Date() })
    .where(eq(counter_order.id, o.id)).returning()
  return orderOut(row!)
}

/** Send an expired order again: re-priced, stock checked again, new number. */
export async function resendOrder(db: DrizzleDB, actor: SaleActor, orderId: string, holdMinutes: number, mayResendAny: boolean) {
  const [o] = await db.select().from(counter_order).where(eq(counter_order.id, orderId)).for("update").limit(1)
  if (!o) throw new OrderError("order_not_found", "Order not found", 404)
  if (!mayResendAny && o.sent_by !== actor.userId) throw new OrderError("not_yours", "You can only resend orders you sent", 403)
  const expired = o.status === "expired" || (o.status === "awaiting_payment" && o.expires_at.getTime() <= Date.now())
  if (!expired) throw new OrderError("order_not_expired", `Order ${orderLabel(o.number)} hasn't expired`, 409)
  await db.update(counter_order).set({ status: "expired", updated_at: new Date() }).where(eq(counter_order.id, o.id))

  const lines = (await activeLines(db, o.id)).filter((l) => l.product_id)
  if (lines.length === 0) throw new OrderError("line_product_gone", "None of the order's products exist any more", 409)
  return sendOrder(db, actor, {
    branch_id: o.branch_id,
    items: lines.map((l) => ({
      product_id: l.product_id!, product_name: l.product_name, product_strength: l.product_strength,
      quantity: l.quantity, unit_price: Number(l.unit_price), discount_percent: Number(l.discount_percent),
      line_total: Number(l.line_total), base_unit: l.base_unit, is_controlled: l.is_controlled,
      sell_unit: l.pack_size_id && l.unit_count ? { pack_size_id: l.pack_size_id, unit_count: l.unit_count } : null,
    })),
    discount_amount: Number(o.discount_amount),
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
  }, holdMinutes)
}

/** Mark open orders past their hold time as expired (tidiness: holds already
 *  stop counting at expires_at). Runs as app_owner from the cron. */
export async function expireOrders(db: DrizzleDB) {
  const rows = await db.update(counter_order).set({ status: "expired", updated_at: new Date() })
    .where(and(eq(counter_order.status, "awaiting_payment"), lte(counter_order.expires_at, sql`now()`)))
    .returning({ id: counter_order.id })
  return rows.length
}

/** Response for an OrderError or a sale error, or null to rethrow. */
export function orderErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof OrderError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
  return saleErrorResponse(e)
}
