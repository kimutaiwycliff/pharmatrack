// Integration check for the cashier station orders (ADR-021,
// lib/cashier-station/orders.ts) against real Postgres under RLS: holds,
// numbering, locked prices, collect, remove line, cancel, expiry, resend.
// Run from apps/web: ../../packages/db/node_modules/.bin/tsx scripts/orders-flow.mts
process.env.DATABASE_URL ||= "postgres://app_owner:app_owner@localhost:55433/pharmatrack"
process.env.DATABASE_AUTHENTICATED_URL ||= "postgres://app_authenticated:app_authenticated@localhost:55433/pharmatrack"

import { eq, inArray } from "drizzle-orm"
const {
  dbAdmin, withTenant, organization, user, branch, product, product_batch, shift, sale, sale_item, payment,
  counter_order, controlled_substance_log,
} = await import("@pharmatrack/db")
type DrizzleDB = import("@pharmatrack/db").DrizzleDB
const { createSale, InsufficientStockError } = await import("../lib/sales/create-sale")
const {
  sendOrder, collectOrder, removeLine, cancelOrder, resendOrder, expireOrders, listOrders, getOrder, OrderError,
} = await import("../lib/cashier-station/orders")
const { reservedByOrders } = await import("../lib/sync/allocation")

const admin = dbAdmin()
const stamp = Date.now()
const ORG = `orders-org-${stamp}`
const DESK = `orders-desk-${stamp}`
const CASHIER = `orders-cashier-${stamp}`
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => {
  if (c) { pass++; console.log(`  PASS ${m}`) } else { fail++; console.error(`  FAIL ${m}`) }
}
async function code(p: Promise<unknown>): Promise<string | null> {
  try { await p; return null } catch (e) {
    if (e instanceof OrderError) return e.code
    if (e instanceof InsufficientStockError) return "insufficient_stock"
    console.error(e); return "unexpected"
  }
}

await admin.insert(organization).values({ id: ORG, name: "Orders Pharmacy", slug: ORG, createdAt: new Date() })
for (const id of [DESK, CASHIER]) {
  await admin.insert(user).values({ id, name: id === DESK ? "Desk Dan" : "Cashier Cate", email: `${id}@orders.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
}
const [br] = await admin.insert(branch).values({ organization_id: ORG, name: "Main", cashier_station_enabled: true }).returning()
const [amox] = await admin.insert(product).values({
  organization_id: ORG, name: "Amoxicillin", base_unit: "tab", units_per_pack: 1,
  selling_price: "10.00", cost_price: "4.00", is_active: true, max_discount_percent: "20",
}).returning()
const [para] = await admin.insert(product).values({
  organization_id: ORG, name: "Paracetamol", base_unit: "tab", units_per_pack: 1, selling_price: "2.00", is_active: true,
}).returning()
const [amoxBatch] = await admin.insert(product_batch).values(
  { organization_id: ORG, product_id: amox!.id, branch_id: br!.id, batch_number: "A1", expiry_date: "2027-06-01", quantity_received: 10, quantity_remaining: 10 },
).returning()
await admin.insert(product_batch).values(
  { organization_id: ORG, product_id: para!.id, branch_id: br!.id, batch_number: "P1", expiry_date: "2027-06-01", quantity_received: 50, quantity_remaining: 50 },
)
const [sh] = await admin.insert(shift).values({ organization_id: ORG, branch_id: br!.id, cashier_id: CASHIER, opening_float: "1000" }).returning()

const desk = { organizationId: ORG, userId: DESK, mayDiscount: true }
const cashier = { organizationId: ORG, userId: CASHIER, mayDiscount: true }
const tx = <T,>(fn: (db: DrizzleDB) => Promise<T>) => withTenant(ORG, fn)
const line = (p: { id: string; name: string }, quantity: number, discount_percent = 0) => ({
  product_id: p.id, product_name: p.name, product_strength: null, quantity,
  unit_price: 1, discount_percent, line_total: 1, base_unit: "tab", is_controlled: false, sell_unit: null,
})
const send = (items: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) => tx((db) => sendOrder(db, desk, {
  branch_id: br!.id, items, discount_amount: 0, customer_name: null, customer_phone: null, ...extra,
}, 30))
const tillSale = (qty: number) => tx((db) => createSale(db, cashier, {
  branch_id: br!.id, shift_id: null, items: [line(amox!, qty)], discount_amount: 0, payment_method: "cash",
  amount_tendered: null, change_given: null, mpesa_reference: null, customer_name: null, customer_phone: null,
}))
const cash = { shift_id: sh!.id, payment_method: "cash" as const, amount_tendered: 1000, change_given: 0 }

try {
  console.log("1. Send prices server-side, numbers the day, holds stock")
  const s1 = await send([line(amox!, 6, 10), line(para!, 5)])
  ok(s1.order.label === "A-001" && s1.order.status === "awaiting_payment", `first order is A-001 (${s1.order.label})`)
  ok(s1.order.total_amount === 64, `6 × 10 less 10% + 5 × 2 = 64 (got ${s1.order.total_amount})`)
  const held = await tx((db) => reservedByOrders(db, br!.id, [amox!.id]))
  ok(held.get(amox!.id) === 6, "6 amoxicillin held")
  ok(await code(tillSale(5)) === "insufficient_stock", "the till can't sell held stock (10 on hand, 6 held)")
  ok(await code(tillSale(4)) === null, "but can sell the 4 that aren't held")
  ok(await code(send([line(amox!, 1)])) === "insufficient_stock", "nor can another order take held stock")
  const s1b = await send([line(para!, 1)], { client_reference: `ref-${stamp}` })
  const s1c = await send([line(para!, 1)], { client_reference: `ref-${stamp}` })
  ok(s1b.order.label === "A-002" && s1c.deduped && s1c.order.id === s1b.order.id, "retried send returns the same order")

  console.log("2. Queue and lookups")
  const queue = await tx((db) => listOrders(db, { branchId: br!.id, view: "queue", userId: CASHIER }))
  ok(queue.length === 2 && queue[0]!.label === "A-001" && queue[0]!.sent_by_name === "Desk Dan", "queue oldest first, with who sent it")
  const byNumber = await tx((db) => getOrder(db, { branchId: br!.id, number: 1 }))
  ok(byNumber?.order.id === s1.order.id && byNumber.order.lines?.length === 2, "found by today's number, with lines")

  console.log("3. Remove a line: hold released, discount follows")
  const para1 = s1.order.lines!.find((l) => l.product_name === "Paracetamol")!
  const after = await tx((db) => removeLine(db, cashier, s1.order.id, para1.id))
  ok(after.total_amount === 54 && after.lines?.length === 1, `total drops to 54 (got ${after.total_amount})`)
  const amoxLine = after.lines![0]!
  ok(await code(tx((db) => removeLine(db, cashier, s1.order.id, amoxLine.id))) === "last_line", "can't remove the last line")

  console.log("4. Collect: locked price, cashier's shift, who served, card")
  await admin.update(product).set({ selling_price: "12.00" }).where(eq(product.id, amox!.id))
  ok(await code(tx((db) => collectOrder(db, cashier, s1.order.id, { ...cash, shift_id: crypto.randomUUID() }))) === "shift_required", "no open shift → refused")
  const paid = await tx((db) => collectOrder(db, cashier, s1.order.id, {
    shift_id: sh!.id, payment_method: "card", amount_tendered: null, change_given: null, card_reference: "AUTH77",
  }))
  ok(paid.sale.total_amount === 54, `charged the price when sent, not the new one (got ${paid.sale.total_amount})`)
  ok(paid.order.status === "paid" && paid.order.sale_id === paid.sale.id, "order paid and linked to its sale")
  const [srow] = await admin.select().from(sale).where(eq(sale.id, paid.sale.id!))
  ok(srow?.cashier_id === CASHIER && srow.sold_by === DESK && srow.shift_id === sh!.id && srow.counter_order_id === s1.order.id,
    "sale: cashier took the money, desk served, on the cashier's shift")
  const [prow] = await admin.select().from(payment).where(eq(payment.sale_id, paid.sale.id!))
  ok(prow?.method === "card" && prow.reference === "AUTH77", "card payment with its approval code")
  const [b] = await admin.select().from(product_batch).where(eq(product_batch.id, amoxBatch!.id))
  ok(b?.quantity_remaining === 0, "stock taken: 10 − 4 (till) − 6 (order)")
  ok((await tx((db) => reservedByOrders(db, br!.id, [amox!.id]))).size === 0, "hold gone once paid")
  ok(await code(tx((db) => collectOrder(db, cashier, s1.order.id, cash))) === "order_not_open", "can't collect twice")

  console.log("5. Cancel")
  ok(await code(tx((db) => cancelOrder(db, cashier, s1b.order.id, false))) === "not_yours", "someone else's order needs the station permission")
  const cancelled = await tx((db) => cancelOrder(db, desk, s1b.order.id, false))
  ok(cancelled.status === "cancelled", "the sender can cancel")
  ok(await code(tx((db) => collectOrder(db, cashier, s1b.order.id, cash))) === "order_not_open", "a cancelled order can't be paid")

  console.log("6. Expiry and resend")
  const s3 = await send([line(para!, 10)])
  await admin.update(counter_order).set({ expires_at: new Date(Date.now() - 1000) }).where(eq(counter_order.id, s3.order.id))
  ok(!(await tx((db) => reservedByOrders(db, br!.id, [para!.id]))).has(para!.id), "an expired order holds nothing")
  ok(await code(tx((db) => collectOrder(db, cashier, s3.order.id, cash))) === "order_expired", "can't be collected")
  // The sweep covers every pharmacy (as the cron does), so count ≥ 1 and check ours.
  const swept = await expireOrders(admin)
  const [s3row] = await admin.select({ status: counter_order.status }).from(counter_order).where(eq(counter_order.id, s3.order.id))
  ok(swept >= 1 && s3row?.status === "expired", "the cron marks it expired")
  await admin.update(product).set({ selling_price: "3.00" }).where(eq(product.id, para!.id))
  const again = await tx((db) => resendOrder(db, desk, s3.order.id, 30, false))
  ok(again.order.label === "A-004" && again.order.total_amount === 30, `resent as A-004 at today's price (${again.order.total_amount})`)
  ok(await code(tx((db) => resendOrder(db, desk, again.order.id, 30, false))) === "order_not_expired", "an open order can't be resent")
  const mine = await tx((db) => listOrders(db, { branchId: br!.id, view: "mine", userId: DESK }))
  ok(mine.length === 4 && mine[0]!.label === "A-004", "the desk sees its orders today, newest first")

  console.log("7. Two cashiers collecting the same order at once")
  const results = await Promise.all([1, 2].map(() => code(tx((db) => collectOrder(db, cashier, again.order.id, cash)))))
  ok(results.filter((r) => r === null).length === 1 && results.includes("order_not_open"), `one sale, one refusal (${results.join(", ")})`)
  const sales = await admin.select().from(sale).where(eq(sale.counter_order_id, again.order.id))
  ok(sales.length === 1, "exactly one sale recorded")
} finally {
  const saleIds = (await admin.select({ id: sale.id }).from(sale).where(eq(sale.organization_id, ORG))).map((s) => s.id)
  if (saleIds.length > 0) {
    const itemIds = (await admin.select({ id: sale_item.id }).from(sale_item).where(inArray(sale_item.sale_id, saleIds))).map((i) => i.id)
    if (itemIds.length > 0) await admin.delete(controlled_substance_log).where(inArray(controlled_substance_log.sale_item_id, itemIds))
    await admin.delete(sale).where(inArray(sale.id, saleIds))
  }
  await admin.delete(shift).where(eq(shift.organization_id, ORG))
  await admin.delete(organization).where(eq(organization.id, ORG))
  await admin.delete(user).where(inArray(user.id, [DESK, CASHIER]))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
