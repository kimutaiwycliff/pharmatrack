import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { addon, audit_log, dbAdmin, org_addon, organization, subscription_payment, type DrizzleDB } from "@pharmatrack/db"
import { ADDON_CODES, isAddonCode, type AddonCode } from "@pharmatrack/core"
import { nairobiDay } from "@/lib/billing/period"
import { addonOffered } from "@/lib/entitlements"
import { notifyPlatformAddonRequest } from "@/lib/notifications/platform"
import { addonCoverage, addonStatusView, type AddonStatusView } from "./addon-period"

// Paid add-ons are switched on by the operator once the pharmacy has paid
// (ADR-021): the owner requests one, pays, and the operator confirms the
// payment, which activates the add-on until `paid_until`.

export interface TenantAddon {
  code: AddonCode
  name: string
  price_kes_month: number
  status: AddonStatusView
  paid_until: string | null
  requested_at: string | null
}

/** Add-ons offered on this deploy, with this tenant's state of each. */
export async function tenantAddons(organizationId: string): Promise<TenantAddon[]> {
  const offered = ADDON_CODES.filter(addonOffered)
  if (offered.length === 0) return []
  const rows = await dbAdmin().select({ a: addon, o: org_addon }).from(addon)
    .leftJoin(org_addon, and(eq(org_addon.addon_code, addon.code), eq(org_addon.organization_id, organizationId)))
    .where(eq(addon.is_active, true))
  const today = nairobiDay(new Date())
  return rows.filter((r) => isAddonCode(r.a.code) && offered.includes(r.a.code as AddonCode)).map((r) => ({
    code: r.a.code as AddonCode,
    name: r.a.name,
    price_kes_month: Number(r.a.price_kes_month),
    status: addonStatusView(r.o, today),
    paid_until: r.o?.paid_until ?? null,
    requested_at: r.o?.requested_at?.toISOString() ?? null,
  }))
}

/** The owner asks for an add-on (or its renewal); the operator is emailed. */
export async function requestAddon(args: {
  organizationId: string; code: AddonCode; userId: string; email: string; note: string | null
}): Promise<{ error: string } | { ok: true }> {
  const db = dbAdmin()
  const current = (await tenantAddons(args.organizationId)).find((a) => a.code === args.code)
  if (!current) return { error: "That add-on isn't available." }
  if (current.status === "requested") return { error: "Your request is already with PharmaTrack." }
  const now = new Date()
  const request = { requested_at: now, requested_by: args.userId, request_note: args.note, updated_at: now }
  await db.insert(org_addon).values({ organization_id: args.organizationId, addon_code: args.code, status: "requested", ...request })
    .onConflictDoUpdate({
      target: [org_addon.organization_id, org_addon.addon_code],
      // An active (or lapsed) add-on stays as it is; the request is for renewal.
      set: { ...request, status: sql`case when ${org_addon.status} = 'active' then 'active' else 'requested' end` },
    })
  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, args.organizationId)).limit(1)
  await notifyPlatformAddonRequest({
    pharmacy: org?.name ?? args.organizationId, organizationId: args.organizationId, email: args.email,
    addon: current.name, priceKes: current.price_kes_month, renewal: current.status === "active" || current.status === "lapsed",
    message: args.note,
  })
  return { ok: true }
}

/** Operator: the pharmacy paid for `months` — activate (or extend) the add-on
 *  and record the payment in the subscription ledger. */
export async function confirmAddonPayment(db: DrizzleDB, args: {
  organizationId: string; code: AddonCode; months: number; amountKes: number
  method: string; reference: string | null; actorId: string
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(org_addon)
      .where(and(eq(org_addon.organization_id, args.organizationId), eq(org_addon.addon_code, args.code))).for("update").limit(1)
    const today = nairobiDay(new Date())
    const coverage = addonCoverage(row?.status === "active" ? row.paid_until : null, today, args.months)
    const now = new Date()
    const fields = {
      status: "active" as const, paid_until: coverage.end, granted_by: args.actorId, cancelled_at: null,
      requested_at: null, requested_by: null, request_note: null, updated_at: now,
    }
    await tx.insert(org_addon).values({ organization_id: args.organizationId, addon_code: args.code, activated_at: now, ...fields })
      .onConflictDoUpdate({
        target: [org_addon.organization_id, org_addon.addon_code],
        set: { ...fields, activated_at: sql`case when ${org_addon.status} = 'active' then ${org_addon.activated_at} else now() end` },
      })
    await tx.insert(subscription_payment).values({
      organization_id: args.organizationId, amount_kes: args.amountKes.toFixed(2), method: args.method, reference: args.reference,
      period_start: coverage.start, period_end: coverage.end, recorded_by: args.actorId,
      status: "confirmed", confirmed_at: now, addon_code: args.code,
    })
    await tx.insert(audit_log).values({
      organization_id: args.organizationId, actor_id: args.actorId, action: "addon.payment_confirmed",
      entity: "org_addon", entity_id: args.code,
      diff: { months: args.months, amount_kes: args.amountKes, method: args.method, reference: args.reference, paid_until: coverage.end, was: row?.status ?? null },
    })
    return { paidUntil: coverage.end, firstActivation: row?.status !== "active" }
  })
}

/** Operator: switch the add-on off now (refund, abuse, mistake). Orders
 *  already sent can still be paid for; no new ones can be sent. */
export async function revokeAddon(db: DrizzleDB, args: { organizationId: string; code: AddonCode; actorId: string }) {
  const [row] = await db.update(org_addon).set({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() })
    .where(and(eq(org_addon.organization_id, args.organizationId), eq(org_addon.addon_code, args.code)))
    .returning({ code: org_addon.addon_code })
  if (!row) return false
  await db.insert(audit_log).values({
    organization_id: args.organizationId, actor_id: args.actorId, action: "addon.revoked",
    entity: "org_addon", entity_id: args.code, diff: {},
  })
  return true
}
