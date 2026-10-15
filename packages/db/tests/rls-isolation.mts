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
    // trial_grant has no FK to organization (survives purge) — delete explicitly.
    await admin.delete(s.trial_grant).where(eq(s.trial_grant.organization_id, orgId))
    await admin.delete(s.trial_extension_request).where(eq(s.trial_extension_request.organization_id, orgId))
    await admin.delete(s.sync_issue).where(eq(s.sync_issue.organization_id, orgId))
    await admin.delete(s.device).where(eq(s.device.organization_id, orgId))
    await admin.delete(s.purchase_order).where(eq(s.purchase_order.organization_id, orgId))
    await admin.delete(s.role_permission).where(eq(s.role_permission.organization_id, orgId))
    await admin.delete(s.sale).where(eq(s.sale.organization_id, orgId))
    await admin.delete(s.product).where(eq(s.product.organization_id, orgId))
    await admin.delete(s.customer).where(eq(s.customer.organization_id, orgId))
    await admin.delete(s.branch).where(eq(s.branch.organization_id, orgId))
    await admin.delete(s.organization).where(eq(s.organization.id, orgId))
    await admin.delete(s.user).where(eq(s.user.id, `rls-user-${orgId}`))
  }
}

async function seed(orgId: string, tag: string) {
  await admin.insert(s.organization).values({ id: orgId, name: tag, createdAt: new Date() })
  const [b] = await admin.insert(s.branch).values({ organization_id: orgId, name: `${tag}-branch` }).returning()
  const [p] = await admin.insert(s.product).values({ organization_id: orgId, name: `${tag}-product`, base_unit: "tablet", selling_price: "5.00" }).returning()
  await admin.insert(s.role_permission).values({ organization_id: orgId, role: "cashier", capability: "reports.view", allowed: true })
  const [po] = await admin.insert(s.purchase_order).values({ organization_id: orgId, branch_id: b.id, po_number: `PO-${tag}` }).returning()
  await admin.insert(s.purchase_order_item).values({ purchase_order_id: po.id, product_id: p.id, product_name: p.name, quantity_ordered: 3 })
  const [dev] = await admin.insert(s.device).values({ organization_id: orgId, branch_id: b.id, name: `${tag}-tablet`, device_code: "D01", token_hash: `hash-${tag}` }).returning()
  await admin.insert(s.device_stock_allocation).values({ device_id: dev.id, product_id: p.id, quantity: 5, reserved_until: new Date(Date.now() + 3_600_000) })
  await admin.insert(s.sync_issue).values({ organization_id: orgId, branch_id: b.id, device_id: dev.id, kind: "late_sync", details: { tag } })
  await admin.insert(s.sync_tombstone).values({ organization_id: orgId, entity: "product", entity_id: `gone-${tag}` })
  await admin.insert(s.customer).values({ organization_id: orgId, full_name: `${tag}-customer` })
  await admin.insert(s.sale).values({ organization_id: orgId, branch_id: b.id, payment_method: "cash", total_amount: "5.00" })
  // Org B's request is already decided, so a pending insert for B can only be
  // stopped by RLS (not by the one-pending-per-org unique index).
  await admin.insert(s.trial_extension_request).values({ organization_id: orgId, message: `${tag}-please`, status: tag === "B" ? "declined" : "pending" })
  await admin.insert(s.trial_grant).values({ organization_id: orgId, email_canonical: `owner-${tag.toLowerCase()}@rls.test`, source: "signup", trial_days: 14, granted: true })
  await admin.insert(s.user).values({ id: `rls-user-${orgId}`, name: `${tag} owner`, email: `rls-user-${tag.toLowerCase()}@rls.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
  await admin.insert(s.reminder_digest).values({ organization_id: orgId, user_id: `rls-user-${orgId}`, digest_date: "2026-10-16", appointment_count: 1, email_status: "sent" })
  await admin.insert(s.idempotency_key).values({ organization_id: orgId, key: `k-rls-test-${tag}`, scope: "batch.create", status_code: 201, response: { tag } })
}

async function run() {
  await cleanup()
  await seed(T1, "A")
  await seed(T2, "B")

  const tables: Array<[string, any]> = [
    ["branch", s.branch], ["product", s.product], ["customer", s.customer], ["sale", s.sale],
    ["role_permission", s.role_permission], ["purchase_order", s.purchase_order],
    ["device", s.device], ["sync_issue", s.sync_issue], ["sync_tombstone", s.sync_tombstone],
    ["trial_extension_request", s.trial_extension_request], ["idempotency_key", s.idempotency_key],
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

  // purchase_order_item has no organization_id — it's scoped through its PO.
  {
    const ownPoIds = new Set((await admin.select().from(s.purchase_order).where(eq(s.purchase_order.organization_id, T1))).map((r: any) => r.id))
    const items = await withTenant(T1, (db: any) => db.select().from(s.purchase_order_item))
    const leaked = items.filter((i: any) => !ownPoIds.has(i.purchase_order_id)).length
    leaked === 0 && items.length >= 1
      ? ok(`purchase_order_item: org A sees its own (${items.length}), none of org B`)
      : bad(`purchase_order_item: leaked=${leaked} visible=${items.length}`)
  }

  // device_stock_allocation is scoped through its device.
  {
    const ownDevIds = new Set((await admin.select().from(s.device).where(eq(s.device.organization_id, T1))).map((r: any) => r.id))
    const allocs = await withTenant(T1, (db: any) => db.select().from(s.device_stock_allocation))
    const leaked = allocs.filter((a: any) => !ownDevIds.has(a.device_id)).length
    leaked === 0 && allocs.length >= 1
      ? ok(`device_stock_allocation: org A sees its own (${allocs.length}), none of org B`)
      : bad(`device_stock_allocation: leaked=${leaked} visible=${allocs.length}`)
  }

  // Branch lock: a branch-locked session pinned to another branch sees no POs.
  {
    const visible = await withTenant({ organizationId: T1, role: "pharmacist", branchId: "00000000-0000-0000-0000-000000000001", branchLocked: true },
      (db: any) => db.select().from(s.purchase_order))
    visible.length === 0 ? ok("purchase_order: branch-locked session sees no other branch's POs") : bad(`purchase_order branch lock leaked ${visible.length}`)
  }

  // reminder_digest is operator-only too (only the reminder cron, as dbAdmin).
  {
    const visible = await withTenant({ organizationId: T1, role: "owner" }, (db: any) => db.select().from(s.reminder_digest))
    const total = (await admin.select().from(s.reminder_digest)).length
    visible.length === 0 && total >= 2
      ? ok(`reminder_digest: tenant session sees 0 of ${total} rows (operator-only)`)
      : bad(`reminder_digest: tenant session sees ${visible.length} rows (total ${total})`)
  }

  // trial_grant is operator-only: no tenant session may read ANY row (incl. its own).
  {
    const visible = await withTenant({ organizationId: T1, role: "owner" }, (db: any) => db.select().from(s.trial_grant))
    const total = (await admin.select().from(s.trial_grant)).length
    visible.length === 0 && total >= 2
      ? ok(`trial_grant: tenant session sees 0 of ${total} rows (operator-only)`)
      : bad(`trial_grant: tenant session sees ${visible.length} rows (total ${total})`)
    try {
      await withTenant({ organizationId: T1, role: "owner" }, (db: any) => db.insert(s.trial_grant).values({ organization_id: T1, email_canonical: "sneaky@rls.test", source: "signup" }))
      bad("trial_grant: tenant insert succeeded (should be blocked)")
    } catch {
      ok("trial_grant: tenant insert blocked")
    }
  }

  // trial_extension_request: tenants can't decide their own request or file one for another org.
  {
    const updated = await withTenant({ organizationId: T1, role: "owner" }, (db: any) =>
      db.update(s.trial_extension_request).set({ status: "approved" }).where(eq(s.trial_extension_request.organization_id, T1)).returning())
    updated.length === 0 ? ok("trial_extension_request: tenant cannot approve its own request") : bad(`trial_extension_request: tenant updated ${updated.length} row(s)`)
    try {
      await withTenant({ organizationId: T1, role: "owner" }, (db: any) => db.insert(s.trial_extension_request).values({ organization_id: T2, message: "sneaky" }))
      bad("trial_extension_request: cross-tenant insert succeeded (should be blocked)")
    } catch {
      ok("trial_extension_request: cross-tenant insert blocked")
    }
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
