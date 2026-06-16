// Smoke test: the FEFO sale path the /api/sales route exercises, end-to-end
// against real Postgres under RLS. Run: pnpm --filter @pharmatrack/db tsx tests/sale-smoke.mts
process.env.DATABASE_URL ||= "postgres://app_owner:app_owner@localhost:55432/pharmatrack"
process.env.DATABASE_AUTHENTICATED_URL ||= "postgres://app_authenticated:app_authenticated@localhost:55432/pharmatrack"

import { and, asc, eq, gt, sql } from "drizzle-orm"
const { dbAdmin, withTenant, organization, branch, product, product_batch, sale, sale_item, payment, controlled_substance_log } = await import("../src/index.ts")

const admin = dbAdmin()
const ORG = `smoke-org-${Date.now()}`
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { c ? (pass++, console.log(`  PASS ${m}`)) : (fail++, console.error(`  FAIL ${m}`)) }

// Seed (privileged, bypasses RLS).
await admin.insert(organization).values({ id: ORG, name: "Smoke Pharmacy", slug: ORG, createdAt: new Date() })
const [br] = await admin.insert(branch).values({ organization_id: ORG, name: "Main" }).returning()
const [prod] = await admin.insert(product).values({
  organization_id: ORG, name: "Amoxicillin", base_unit: "tab", units_per_pack: 1,
  selling_price: "10.00", cost_price: "4.00", is_controlled: true, is_active: true,
}).returning()
// Two batches: nearer expiry first should be consumed first (FEFO).
await admin.insert(product_batch).values([
  { organization_id: ORG, product_id: prod!.id, branch_id: br!.id, batch_number: "B-NEAR", expiry_date: "2026-08-01", quantity_received: 30, quantity_remaining: 30 },
  { organization_id: ORG, product_id: prod!.id, branch_id: br!.id, batch_number: "B-FAR", expiry_date: "2027-01-01", quantity_received: 30, quantity_remaining: 30 },
])

// Sell 40 units under RLS — should drain B-NEAR (30) then take 10 from B-FAR.
const result = await withTenant(ORG, async (db) => {
  const seqRows = (await db.execute(sql`select nextval('receipt_number_seq')::int as n`)) as unknown as Array<{ n: number }>
  const [s] = await db.insert(sale).values({
    organization_id: ORG, branch_id: br!.id, receipt_number: `RCP-${seqRows[0]!.n}`,
    status: "completed", subtotal: "400.00", total_amount: "400.00", payment_method: "cash",
  }).returning()

  const batches = await db.select({ id: product_batch.id, quantity_remaining: product_batch.quantity_remaining, batch_number: product_batch.batch_number })
    .from(product_batch).where(and(eq(product_batch.product_id, prod!.id), eq(product_batch.branch_id, br!.id), gt(product_batch.quantity_remaining, 0)))
    .orderBy(asc(product_batch.expiry_date))

  const rows: Array<typeof sale_item.$inferInsert> = []
  const meta: Array<{ batch_number: string }> = []
  let remaining = 40
  for (const b of batches) {
    if (remaining <= 0) break
    const take = Math.min(remaining, b.quantity_remaining)
    await db.update(product_batch).set({ quantity_remaining: b.quantity_remaining - take })
      .where(and(eq(product_batch.id, b.id), eq(product_batch.quantity_remaining, b.quantity_remaining)))
    rows.push({ sale_id: s!.id, product_id: prod!.id, batch_id: b.id, product_name: "Amoxicillin", quantity: take, unit_price: "10.00", line_total: String(take * 10) })
    meta.push({ batch_number: b.batch_number })
    remaining -= take
  }
  const inserted = await db.insert(sale_item).values(rows).returning()
  const csRows = inserted.map((row, i) => ({ organization_id: ORG, sale_item_id: row.id, quantity: row.quantity, batch_number: meta[i]!.batch_number }))
  await db.insert(controlled_substance_log).values(csRows)
  await db.insert(payment).values({ sale_id: s!.id, method: "cash", amount: "400.00" })
  return { sale: s, items: inserted }
})

ok(!!result.sale?.receipt_number, `receipt number assigned (${result.sale?.receipt_number})`)
ok(result.items.length === 2, `2 sale_item lines from FEFO split (got ${result.items.length})`)

const near = result.items.find((i) => i.quantity === 30)
const far = result.items.find((i) => i.quantity === 10)
ok(!!near && !!far, "split as 30 (near expiry) + 10 (far expiry)")

const remainingRows = await admin.select({ batch_number: product_batch.batch_number, qty: product_batch.quantity_remaining })
  .from(product_batch).where(eq(product_batch.product_id, prod!.id)).orderBy(asc(product_batch.expiry_date))
ok(remainingRows[0]?.batch_number === "B-NEAR" && remainingRows[0]?.qty === 0, "B-NEAR fully drained (FEFO)")
ok(remainingRows[1]?.batch_number === "B-FAR" && remainingRows[1]?.qty === 20, "B-FAR reduced 30→20")

const cs = await admin.select().from(controlled_substance_log).where(eq(controlled_substance_log.organization_id, ORG))
ok(cs.length === 2, `controlled-substance log entries written (${cs.length})`)

const pays = await admin.select().from(payment).where(eq(payment.sale_id, result.sale!.id))
ok(pays.length === 1 && Number(pays[0]!.amount) === 400, "payment row recorded")

// Cleanup. sale_item.product_id has no ON DELETE CASCADE, so drop sales (cascades
// sale_item + payment) and the CS log before the org cascade reaches product.
await admin.delete(controlled_substance_log).where(eq(controlled_substance_log.organization_id, ORG))
await admin.delete(sale).where(eq(sale.organization_id, ORG))
await admin.delete(organization).where(eq(organization.id, ORG))

console.log(fail === 0 ? "\nSALE SMOKE: ALL PASS" : `\nSALE SMOKE: ${fail} FAILED`)
process.exit(fail === 0 ? 0 : 1)
