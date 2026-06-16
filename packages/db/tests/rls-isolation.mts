// Two-org RLS isolation suite (CLAUDE.md §2.1 / §2.8 — must be green to merge).
// Seeds two orgs as app_owner, then asserts via withTenant() that each org sees
// ONLY its own rows on every tenant table, and cross-tenant writes are blocked.
//
// Run against a live stack:  make up && make test-rls
process.env.DATABASE_URL ||= "postgres://app_owner:app_owner@localhost:55432/pharmatrack"
process.env.DATABASE_AUTHENTICATED_URL ||= "postgres://app_authenticated:app_authenticated@localhost:55432/pharmatrack"

import { eq } from "drizzle-orm"
const { dbAdmin, withTenant } = await import("../src/client.ts")
const s: any = await import("../src/schema/index.ts")

const T1 = "rls-test-org-1", T2 = "rls-test-org-2"
let failures = 0
const ok = (m: string) => console.log("  \x1b[32mPASS\x1b[0m " + m)
const bad = (m: string) => { failures++; console.log("  \x1b[31mFAIL\x1b[0m " + m) }

const admin = dbAdmin()

async function cleanup() {
  // Children/refs first; orgs cascade most, but be explicit for re-runs.
  for (const orgId of [T1, T2]) {
    await admin.delete(s.sale).where(eq(s.sale.organization_id, orgId))
    await admin.delete(s.product).where(eq(s.product.organization_id, orgId))
    await admin.delete(s.customer).where(eq(s.customer.organization_id, orgId))
    await admin.delete(s.branch).where(eq(s.branch.organization_id, orgId))
    await admin.delete(s.organization).where(eq(s.organization.id, orgId))
  }
}

async function seed(orgId: string, tag: string) {
  await admin.insert(s.organization).values({ id: orgId, name: tag, createdAt: new Date() })
  const [b] = await admin.insert(s.branch).values({ organization_id: orgId, name: `${tag}-branch` }).returning()
  await admin.insert(s.product).values({ organization_id: orgId, name: `${tag}-product`, base_unit: "tablet", selling_price: "5.00" })
  await admin.insert(s.customer).values({ organization_id: orgId, full_name: `${tag}-customer` })
  await admin.insert(s.sale).values({ organization_id: orgId, branch_id: b.id, payment_method: "cash", total_amount: "5.00" })
}

async function run() {
  await cleanup()
  await seed(T1, "A")
  await seed(T2, "B")

  const tables: Array<[string, any]> = [
    ["branch", s.branch], ["product", s.product], ["customer", s.customer], ["sale", s.sale],
  ]

  // Each org sees only its own rows on each table.
  for (const [name, table] of tables) {
    const rows = await withTenant(T1, (db: any) => db.select().from(table))
    const all = await admin.select().from(table)
    const fromOtherOrg = rows.filter((r: any) => r.organization_id === T2).length
    const ownVisible = rows.filter((r: any) => r.organization_id === T1).length
    if (fromOtherOrg === 0 && ownVisible >= 1 && rows.length < all.length)
      ok(`${name}: org A sees its own (${ownVisible}), none of org B`)
    else
      bad(`${name}: leaked=${fromOtherOrg} own=${ownVisible} visible=${rows.length} total=${all.length}`)
  }

  // Deny-by-default: no org set → nothing visible.
  const noneVisible = await withTenant("", (db: any) => db.select().from(s.product))
  noneVisible.length === 0 ? ok("deny-by-default: no org → 0 products") : bad(`deny-by-default leaked ${noneVisible.length}`)

  // Cross-tenant write blocked by RLS WITH CHECK.
  try {
    await withTenant(T1, (db: any) => db.insert(s.product).values({ organization_id: T2, name: "sneaky", base_unit: "tablet", selling_price: "1.00" }))
    bad("cross-tenant insert succeeded (should be blocked)")
  } catch {
    ok("cross-tenant insert blocked by RLS")
  }

  await cleanup()
  console.log(failures === 0 ? "\n\x1b[32mRLS ISOLATION: ALL PASS\x1b[0m" : `\n\x1b[31mRLS ISOLATION: ${failures} FAILURE(S)\x1b[0m`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((e) => { console.error(e); process.exit(1) })
