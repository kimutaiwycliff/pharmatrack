// Integration check for createSale() (lib/sales/create-sale.ts), the code behind
// POST /api/sales and the cashier station's collect (ADR-021), against real
// Postgres under RLS. Expected values are worked out by hand from the fixtures.
// Run from apps/web: ../../packages/db/node_modules/.bin/tsx scripts/sale-parity.mts
process.env.DATABASE_URL ||= "postgres://app_owner:app_owner@localhost:55433/pharmatrack"
process.env.DATABASE_AUTHENTICATED_URL ||= "postgres://app_authenticated:app_authenticated@localhost:55433/pharmatrack"

import { and, eq, inArray } from "drizzle-orm"
const {
  dbAdmin, withTenant, organization, branch, product, product_batch, product_pack_size, sale, sale_item, payment,
  mpesa_stk_request, controlled_substance_log,
} = await import("@pharmatrack/db")
const {
  createSale, saleErrorResponse, InsufficientStockError, UnpricedProductError, InvalidProductError, MpesaNotConfirmedError,
} = await import("../lib/sales/create-sale")
type SaleInput = import("../lib/sales/create-sale").SaleInput

const admin = dbAdmin()
const stamp = Date.now()
const ORG = `parity-org-${stamp}`
const OTHER = `parity-other-${stamp}`
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => {
  if (c) { pass++; console.log(`  PASS ${m}`) } else { fail++; console.error(`  FAIL ${m}`) }
}

// ── Fixtures (privileged, bypasses RLS) ─────────────────────────────────────
for (const id of [ORG, OTHER]) {
  await admin.insert(organization).values({ id, name: `Parity ${id}`, slug: id, createdAt: new Date() })
}
const [br] = await admin.insert(branch).values({ organization_id: ORG, name: "Main" }).returning()
const [otherBr] = await admin.insert(branch).values({ organization_id: OTHER, name: "Other" }).returning()
const [amox] = await admin.insert(product).values({
  organization_id: ORG, name: "Amoxicillin", base_unit: "tab", units_per_pack: 1,
  selling_price: "10.00", cost_price: "4.00", is_controlled: true, is_active: true, max_discount_percent: "10",
}).returning()
const [para] = await admin.insert(product).values({
  organization_id: ORG, name: "Paracetamol", base_unit: "tab", units_per_pack: 1,
  selling_price: "2.00", cost_price: "1.00", is_controlled: false, is_active: true,
}).returning()
const [unpriced] = await admin.insert(product).values({
  organization_id: ORG, name: "Unpriced", base_unit: "tab", units_per_pack: 1, selling_price: "0", is_active: true,
}).returning()
const [foreign] = await admin.insert(product).values({
  organization_id: OTHER, name: "Foreign", base_unit: "tab", units_per_pack: 1, selling_price: "5.00", is_active: true,
}).returning()
// A strip of 10 paracetamol for KES 15 (cheaper than 10 × 2).
const [strip] = await admin.insert(product_pack_size).values({
  product_id: para!.id, label: "Strip of 10", unit_count: 10, selling_price: "15.00", is_active: true,
}).returning()
const [near, far] = await admin.insert(product_batch).values([
  { organization_id: ORG, product_id: amox!.id, branch_id: br!.id, batch_number: "A-NEAR", expiry_date: "2027-01-01", quantity_received: 30, quantity_remaining: 30, cost_price: "3.00" },
  { organization_id: ORG, product_id: amox!.id, branch_id: br!.id, batch_number: "A-FAR", expiry_date: "2028-01-01", quantity_received: 30, quantity_remaining: 30 },
]).returning()
const [paraBatch] = await admin.insert(product_batch).values(
  { organization_id: ORG, product_id: para!.id, branch_id: br!.id, batch_number: "P-1", expiry_date: "2027-06-01", quantity_received: 100, quantity_remaining: 100 },
).returning()
await admin.insert(product_batch).values(
  { organization_id: OTHER, product_id: foreign!.id, branch_id: otherBr!.id, batch_number: "F-1", expiry_date: "2027-06-01", quantity_received: 50, quantity_remaining: 50 },
)

// No user row needed: sale.cashier_id is nullable.
const actor = { organizationId: ORG, userId: null as unknown as string, mayDiscount: true }
const line = (p: { id: string; name: string }, quantity: number, extra: Partial<SaleInput["items"][number]> = {}) => ({
  product_id: p.id, product_name: p.name, product_strength: null, quantity,
  unit_price: 999, discount_percent: 0, line_total: 999, base_unit: "tab", is_controlled: p.id === amox!.id, ...extra,
})
const input = (items: SaleInput["items"], extra: Partial<SaleInput> = {}): SaleInput => ({
  branch_id: br!.id, shift_id: null, items, discount_amount: 0, payment_method: "cash",
  amount_tendered: null, change_given: null, mpesa_reference: null, customer_name: null, customer_phone: null, ...extra,
})
const sell = (data: SaleInput, a = actor) => withTenant(ORG, (db) => createSale(db, a, data))
const qty = async (id: string) => (await admin.select().from(product_batch).where(eq(product_batch.id, id)))[0]!.quantity_remaining
async function rejects<E>(p: Promise<unknown>, cls: new (...args: never[]) => E): Promise<E | null> {
  try { await p; return null } catch (e) { return e instanceof cls ? e : (console.error(e), null) }
}

try {
  console.log("1. Cash sale, FEFO across two batches, controlled register, client price ignored")
  const r1 = await sell(input([line(amox!, 40)]))
  ok(r1.sale.receipt_number?.startsWith("RCP-") === true, `receipt number (${r1.sale.receipt_number})`)
  ok(r1.items.length === 2, `2 lines from the FEFO split (got ${r1.items.length})`)
  ok(r1.items[0]?.batch_id === near!.id && r1.items[0]?.quantity === 30, "earliest expiry drained first (30)")
  ok(r1.items[1]?.batch_id === far!.id && r1.items[1]?.quantity === 10, "then 10 from the later batch")
  ok(r1.sale.total_amount === 400, `total = 40 × KES 10 from the server price, not the client's 999 (got ${r1.sale.total_amount})`)
  ok(await qty(near!.id) === 0 && await qty(far!.id) === 20, "batch quantities decremented")
  ok(r1.items[0]?.unit_cost === "3.00" && r1.items[1]?.unit_cost === "4.00", "unit cost = batch cost, else product cost")
  const cs = await admin.select().from(controlled_substance_log).where(inArray(controlled_substance_log.sale_item_id, r1.items.map((i) => i.id)))
  ok(cs.length === 2, `controlled register: one row per batch line (got ${cs.length})`)
  const p1 = await admin.select().from(payment).where(eq(payment.sale_id, r1.sale.id!))
  ok(p1.length === 1 && p1[0]!.method === "cash" && Number(p1[0]!.amount) === 400, "one cash payment row for the total")
  ok(r1.paperWidth === "80mm", "default paper width")

  console.log("2. Discounts: capped by max_discount_percent, zero without permission")
  const r2 = await sell(input([line(amox!, 2, { discount_percent: 50 })]))
  ok(r2.items[0]?.discount_percent === 10 && r2.sale.total_amount === 18, `line discount capped at 10% → KES 18 (got ${r2.sale.total_amount})`)
  const r3 = await sell(input([line(amox!, 2, { discount_percent: 5 })], { discount_amount: 5 }), { ...actor, mayDiscount: false })
  ok(r3.sale.total_amount === 20 && r3.sale.discount_amount === 0, `no pos.discount → no discount (got ${r3.sale.total_amount})`)
  const r4 = await sell(input([line(amox!, 10)], { discount_amount: 50 }))
  ok(r4.sale.discount_amount === 10 && r4.sale.total_amount === 90, `cart discount capped at 10% of 100 (got ${r4.sale.discount_amount})`)

  console.log("3. Pack size priced from product_pack_size")
  const r5 = await sell(input([line(para!, 20, { sell_unit: { pack_size_id: strip!.id, unit_count: 10 } })]))
  ok(r5.sale.total_amount === 30, `2 strips × KES 15 (got ${r5.sale.total_amount})`)
  ok(await qty(paraBatch!.id) === 80, "20 base units deducted")
  ok(!!await rejects(sell(input([line(para!, 15, { sell_unit: { pack_size_id: strip!.id, unit_count: 10 } })])), InvalidProductError), "part of a pack rejected")

  console.log("4. Rejections roll the whole sale back")
  const before = await qty(far!.id)
  const short = await rejects(sell(input([line(para!, 1), line(amox!, before + 1)])), InsufficientStockError)
  ok(!!short && short.shortfalls[0]?.available === before, `insufficient stock reports what's available (${before})`)
  ok(await qty(far!.id) === before && await qty(paraBatch!.id) === 80, "nothing decremented")
  ok(!!await rejects(sell(input([line(unpriced!, 1)])), UnpricedProductError), "unpriced product rejected")
  ok(!!await rejects(sell(input([line(foreign!, 1)])), InvalidProductError), "another tenant's product is invisible (RLS) → invalid")

  console.log("5. Offline re-sync dedupes on offline_reference")
  const ref = `parity-${stamp}`
  const r6 = await sell(input([line(para!, 1)], { offline_reference: ref }))
  const r7 = await sell(input([line(para!, 1)], { offline_reference: ref }))
  ok("deduped" in r7 && r7.deduped === true && r7.sale.id === r6.sale.id, "second sync returns the first sale")
  ok(await qty(paraBatch!.id) === 79, "stock taken once")

  console.log("6. Split with a confirmed STK push, claimed once")
  const checkout = `ws_CO_parity_${stamp}`
  await admin.insert(mpesa_stk_request).values({
    organization_id: ORG, checkout_request_id: checkout, phone: "254700000000", amount: "15.00", status: "paid", mpesa_receipt: "PARITY123",
  })
  const r8 = await sell(input([line(para!, 10)], { payment_method: "split", cash_amount: 5, mpesa_amount: 15, mpesa_checkout_request_id: checkout }))
  const p8 = await admin.select().from(payment).where(eq(payment.sale_id, r8.sale.id!))
  ok(p8.length === 2, "one payment row per method")
  ok(p8.some((p) => p.method === "cash" && Number(p.amount) === 5), "cash part")
  ok(p8.some((p) => p.method === "mpesa" && Number(p.amount) === 15 && p.mpesa_receipt === "PARITY123" && p.mpesa_checkout_id === checkout), "M-Pesa part carries the receipt")
  const [claimed] = await admin.select().from(mpesa_stk_request).where(eq(mpesa_stk_request.checkout_request_id, checkout))
  ok(claimed?.sale_id === r8.sale.id, "STK request tied to the sale")
  ok(!!await rejects(sell(input([line(para!, 10)], { payment_method: "mpesa", mpesa_checkout_request_id: checkout })), MpesaNotConfirmedError), "same payment can't back a second sale")

  console.log("7. Error responses")
  const status = (e: unknown) => saleErrorResponse(e)?.status
  ok(status(new InsufficientStockError([])) === 409, "insufficient stock → 409")
  ok(status(new UnpricedProductError("x")) === 409, "unpriced → 409")
  ok(status(new InvalidProductError("x", "x")) === 400, "invalid product → 400")
  ok(status(new MpesaNotConfirmedError("x")) === 409, "M-Pesa not confirmed → 409")
  ok(status({ code: "23505" }) === 200, "duplicate offline reference → 200 deduped")
  ok(saleErrorResponse(new Error("other")) === null, "anything else is rethrown")
} finally {
  // Clean up both tenants (cascades through branches, products, batches).
  const saleIds = (await admin.select({ id: sale.id }).from(sale).where(eq(sale.organization_id, ORG))).map((s) => s.id)
  await admin.delete(mpesa_stk_request).where(eq(mpesa_stk_request.organization_id, ORG))
  if (saleIds.length > 0) {
    const itemIds = (await admin.select({ id: sale_item.id }).from(sale_item).where(inArray(sale_item.sale_id, saleIds))).map((i) => i.id)
    if (itemIds.length > 0) await admin.delete(controlled_substance_log).where(inArray(controlled_substance_log.sale_item_id, itemIds))
    await admin.delete(sale).where(and(eq(sale.organization_id, ORG), inArray(sale.id, saleIds)))
  }
  await admin.delete(organization).where(inArray(organization.id, [ORG, OTHER]))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
