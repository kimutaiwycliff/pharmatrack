// Integration check for operator-enabled add-ons (ADR-021,
// lib/cashier-station/addons.ts) against real Postgres: request, payment
// confirmed by the operator, early renewal, lapse, revoke.
// Run from apps/web: ../../packages/db/node_modules/.bin/tsx scripts/addons-flow.mts
process.env.DATABASE_URL ||= "postgres://app_owner:app_owner@localhost:55433/pharmatrack"
process.env.DATABASE_AUTHENTICATED_URL ||= "postgres://app_authenticated:app_authenticated@localhost:55433/pharmatrack"
process.env.CASHIER_STATION_ENABLED = "true"

import { and, eq } from "drizzle-orm"
import { createRequire } from "node:module"
// The code under test is marked `server-only`, which throws outside Next's
// server build; this script is server-side, so stand it in with an empty module.
const req = createRequire(import.meta.url)
const shim = req.resolve("server-only")
req.cache[shim] = { id: shim, filename: shim, loaded: true, exports: {} } as unknown as NodeJS.Module
const { dbAdmin, organization, user, org_addon, subscription_payment, audit_log } = await import("@pharmatrack/db")
const { tenantAddons, requestAddon, confirmAddonPayment, revokeAddon } = await import("../lib/cashier-station/addons")
const { hasAddon } = await import("../lib/entitlements")
const { nairobiDay, addDaysToDay, addMonthsToDay } = await import("../lib/billing/period")

const admin = dbAdmin()
const stamp = Date.now()
const ORG = `addons-org-${stamp}`, OWNER = `addons-owner-${stamp}`, OPERATOR = `addons-op-${stamp}`
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => {
  if (c) { pass++; console.log(`  PASS ${m}`) } else { fail++; console.error(`  FAIL ${m}`) }
}
const state = async () => (await tenantAddons(ORG)).find((a) => a.code === "cashier_station")!
const today = nairobiDay(new Date())

await admin.insert(organization).values({ id: ORG, name: "Addons Pharmacy", slug: ORG, createdAt: new Date() })
for (const id of [OWNER, OPERATOR]) {
  await admin.insert(user).values({ id, name: id, email: `${id}@addons.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
}

try {
  console.log("1. Owner requests it — still off until paid")
  ok((await state()).status === "none" && (await state()).price_kes_month === 1500, "offered at KES 1,500, not requested")
  ok("ok" in (await requestAddon({ organizationId: ORG, code: "cashier_station", userId: OWNER, email: "o@x.test", note: "QK12ABC" })), "request accepted")
  ok((await state()).status === "requested", "status: requested")
  ok(!(await hasAddon(ORG, "cashier_station")), "not active yet")
  ok("error" in (await requestAddon({ organizationId: ORG, code: "cashier_station", userId: OWNER, email: "o@x.test", note: null })), "a second request is refused")

  console.log("2. Operator confirms payment — on for the month paid")
  const first = await confirmAddonPayment(admin, { organizationId: ORG, code: "cashier_station", months: 1, amountKes: 1500, method: "mpesa", reference: "QK12ABC", actorId: OPERATOR })
  const end1 = addDaysToDay(addMonthsToDay(today, 1), -1)
  ok(first.firstActivation && first.paidUntil === end1, `active until ${end1} (got ${first.paidUntil})`)
  ok(await hasAddon(ORG, "cashier_station"), "now active")
  const s1 = await state()
  ok(s1.status === "active" && s1.requested_at === null, "request cleared")
  const pays = await admin.select().from(subscription_payment).where(eq(subscription_payment.organization_id, ORG))
  ok(pays.length === 1 && pays[0]!.addon_code === "cashier_station" && Number(pays[0]!.amount_kes) === 1500 && pays[0]!.reference === "QK12ABC" && pays[0]!.status === "confirmed",
    "payment in the ledger, tagged with the add-on")
  ok(pays[0]!.period_start === today && pays[0]!.period_end === end1, "ledger period matches")

  console.log("3. Renewal paid early continues from the current end")
  await requestAddon({ organizationId: ORG, code: "cashier_station", userId: OWNER, email: "o@x.test", note: "renew" })
  ok((await state()).status === "active" && (await state()).requested_at !== null, "renewal request keeps it active")
  const second = await confirmAddonPayment(admin, { organizationId: ORG, code: "cashier_station", months: 2, amountKes: 3000, method: "mpesa", reference: "QK34DEF", actorId: OPERATOR })
  const end2 = addDaysToDay(addMonthsToDay(addDaysToDay(end1, 1), 2), -1)
  ok(!second.firstActivation && second.paidUntil === end2, `extended to ${end2} (got ${second.paidUntil})`)

  console.log("4. Past the paid day it switches itself off")
  await admin.update(org_addon).set({ paid_until: addDaysToDay(today, -1) }).where(eq(org_addon.organization_id, ORG))
  ok(!(await hasAddon(ORG, "cashier_station")) && (await state()).status === "lapsed", "lapsed → not active")
  const third = await confirmAddonPayment(admin, { organizationId: ORG, code: "cashier_station", months: 1, amountKes: 1500, method: "mpesa", reference: null, actorId: OPERATOR })
  ok(third.paidUntil === end1 && (await hasAddon(ORG, "cashier_station")), "paying after a lapse starts again from today")

  console.log("5. Operator switches it off")
  ok(await revokeAddon(admin, { organizationId: ORG, code: "cashier_station", actorId: OPERATOR }), "revoked")
  ok(!(await hasAddon(ORG, "cashier_station")) && (await state()).status === "cancelled", "off, shown as not active")
  const audits = await admin.select({ action: audit_log.action }).from(audit_log).where(and(eq(audit_log.organization_id, ORG), eq(audit_log.entity, "org_addon")))
  ok(audits.filter((a) => a.action === "addon.payment_confirmed").length === 3 && audits.some((a) => a.action === "addon.revoked"), "every payment and the revoke are audit-logged")
} finally {
  await admin.delete(audit_log).where(eq(audit_log.organization_id, ORG))
  await admin.delete(organization).where(eq(organization.id, ORG))
  for (const id of [OWNER, OPERATOR]) await admin.delete(user).where(eq(user.id, id))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
