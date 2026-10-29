import { NextRequest, NextResponse } from "next/server"
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { withTenant, appointment, customer, device_request, notification_state, product, product_stock, stock_count, subscription } from "@pharmatrack/db"
import { alertStatus, type BellAlert } from "@/lib/notifications/bell"
import { listShelves } from "@/lib/stockTake/server"
import { callWindow } from "@/lib/appointments/call-list"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { mergeAcrossBranches, resolveBranchScope } from "@/lib/inventory/aggregate"

// Live-computed notification bell data - no notification table, just reads of
// existing stock/expiry/subscription state. Scoped to the three cases that
// need zero new infrastructure: low stock, expiring batches, trial ending
// soon. (past_due/suspended/cancelled subscriptions are already fully blocked
// by SubscriptionGate before a user ever reaches this route, so there's
// nothing to notify about for those.)
const EXPIRY_WARN_DAYS = 90
const TRIAL_WARN_DAYS = 7
const MAX_ITEMS = 5

export async function GET(request: NextRequest) {
  const requestedBranch = new URL(request.url).searchParams.get("branch_id")

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  const branchId = resolveBranchScope(ctx, requestedBranch)

  return withTenant(ctx, async (db) => {
    const rawRows = await db.select({
      product_id: product_stock.product_id,
      branch_id: product_stock.branch_id,
      batch_count: product_stock.batch_count,
      name: product_stock.name,
      stock_on_hand: product_stock.stock_on_hand,
      reorder_level: product_stock.reorder_level,
      earliest_expiry: product_stock.earliest_expiry,
    }).from(product_stock)
      .where(and(branchId ? eq(product_stock.branch_id, branchId) : undefined, eq(product_stock.is_active, true)))
    const stockRows = branchId ? rawRows : mergeAcrossBranches(rawRows)

    const now = Date.now()
    const warnMs = EXPIRY_WARN_DAYS * 86_400_000

    const lowStock = stockRows
      .filter((p) => (p.stock_on_hand ?? 0) <= (p.reorder_level ?? 10))
      .sort((a, b) => (a.stock_on_hand ?? 0) - (b.stock_on_hand ?? 0))
      .map((p) => ({
        product_id: p.product_id,
        name: p.name,
        stock_on_hand: p.stock_on_hand ?? 0,
        reorder_level: p.reorder_level ?? 10,
      }))

    const expiring = stockRows
      .filter((p) => p.earliest_expiry && new Date(p.earliest_expiry).getTime() - now <= warnMs)
      .sort((a, b) => new Date(a.earliest_expiry!).getTime() - new Date(b.earliest_expiry!).getTime())
      .map((p) => ({
        product_id: p.product_id,
        name: p.name,
        earliest_expiry: p.earliest_expiry,
        daysUntil: Math.max(0, Math.ceil((new Date(p.earliest_expiry!).getTime() - now) / 86_400_000)),
      }))

    let trialEndingSoon: { trial_ends_at: string; daysLeft: number } | null = null
    if (ctx.permissions.includes("billing.manage")) {
      const [sub] = await db.select({
        status: subscription.status,
        trial_ends_at: subscription.trial_ends_at,
      }).from(subscription).where(eq(subscription.organization_id, ctx.organizationId)).limit(1)

      if (sub?.status === "trialing" && sub.trial_ends_at) {
        const daysLeft = Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / 86_400_000)
        if (daysLeft <= TRIAL_WARN_DAYS) {
          trialEndingSoon = { trial_ends_at: sub.trial_ends_at.toISOString(), daysLeft: Math.max(0, daysLeft) }
        }
      }
    }

    // Products with no selling price (e.g. Quick Start items whose catalogue
    // entry had none) can't be sold — prompt whoever can price them.
    let needsPrice = 0
    if (ctx.permissions.includes("products.edit")) {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(product)
        .where(or(isNull(product.selling_price), sql`${product.selling_price} <= 0`))
      needsPrice = r?.n ?? 0
    }

    // Clients to phone about today's/tomorrow's appointments (no-SMS reminders).
    let toCall = 0
    if (ctx.permissions.includes("appointments.manage")) {
      const w = callWindow()
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(appointment)
        .leftJoin(customer, eq(customer.id, appointment.customer_id))
        .where(and(
          gte(appointment.scheduled_at, w.start), lt(appointment.scheduled_at, w.end),
          eq(appointment.status, "scheduled"), isNull(appointment.contact_outcome),
          or(isNull(customer.reminders_opt_in), eq(customer.reminders_opt_in, true)),
          branchId ? eq(appointment.branch_id, branchId) : undefined,
        ))
      toCall = r?.n ?? 0
    }

    // Devices waiting for approval (ADR-018) — someone may be standing at a till.
    // Only sent to approvers — the bell polls requests more often only for them.
    let devicesWaiting: number | undefined
    if (ctx.permissions.includes("devices.manage")) {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(device_request)
        .where(and(eq(device_request.status, "pending"), sql`${device_request.expires_at} > now()`))
      devicesWaiting = r?.n ?? 0
    }

    // Stock take (ADR-020): counts waiting for an approver, and a weekly nudge
    // — when nothing was counted at this branch in 7 days, the biggest shelf
    // not counted in 90. One shelf a week instead of a dreaded yearly count.
    let stockTake: { waiting: number; dueShelf: { name: string; products: number } | null } | undefined
    if (ctx.permissions.includes("stock.count")) {
      let waiting = 0
      if (ctx.permissions.includes("stock.adjust")) {
        const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(stock_count)
          .where(and(eq(stock_count.status, "review"), branchId ? eq(stock_count.branch_id, branchId) : undefined))
        waiting = r?.n ?? 0
      }
      let dueShelf: { name: string; products: number } | null = null
      if (branchId) {
        const [recent] = await db.select({ n: sql<number>`count(*)::int` }).from(stock_count)
          .where(and(eq(stock_count.branch_id, branchId), eq(stock_count.status, "posted"), gte(stock_count.posted_at, new Date(now - 7 * 86_400_000))))
        if (!recent?.n) {
          const due = (await listShelves(db, branchId))
            .filter((s) => s.products > 0 && (!s.lastCounted || now - new Date(s.lastCounted).getTime() > 90 * 86_400_000))
            .sort((a, b) => b.products - a.products)[0]
          if (due) dueShelf = { name: due.name, products: due.products }
        }
      }
      stockTake = { waiting, dueShelf }
    }

    // Each alert has a key and a version (fingerprint); this person's seen /
    // dismissed / snoozed state decides what shows and what counts as new.
    const nairobiDay = new Date(now + 3 * 3_600_000).toISOString().slice(0, 10)
    const week = Math.floor((now + 3 * 3_600_000) / (7 * 86_400_000))
    const lowKey = (p: { product_id: string | null; stock_on_hand: number }) => ({ key: `low:${p.product_id}`, fp: p.stock_on_hand <= 0 ? "out" : "low" })
    const expKey = (p: { product_id: string | null; earliest_expiry: string | null; daysUntil: number }) => ({ key: `exp:${p.product_id}`, fp: `${p.earliest_expiry}|${p.daysUntil <= 30 ? 30 : 90}` })
    const singles: BellAlert[] = [
      ...(trialEndingSoon ? [{ key: "trial", fp: String(trialEndingSoon.daysLeft <= 1 ? 1 : trialEndingSoon.daysLeft <= 3 ? 3 : 7) }] : []),
      ...(needsPrice > 0 ? [{ key: "price", fp: String(needsPrice) }] : []),
      ...(toCall > 0 ? [{ key: "call", fp: `${nairobiDay}|${toCall}` }] : []),
      ...(devicesWaiting ? [{ key: "devices", fp: String(devicesWaiting) }] : []),
      ...(stockTake?.waiting ? [{ key: "st-wait", fp: String(stockTake.waiting) }] : []),
      ...(stockTake?.dueShelf ? [{ key: "st-due", fp: `${stockTake.dueShelf.name}|${week}` }] : []),
    ]
    const all = [...lowStock.map(lowKey), ...expiring.map(expKey), ...singles]
    const rows = all.length
      ? await db.select().from(notification_state).where(and(eq(notification_state.user_id, ctx.userId), inArray(notification_state.key, all.map((x) => x.key))))
      : []
    const stateOf = new Map(rows.map((r) => [r.key, r]))
    const status: Record<string, "new" | "seen"> = {}
    const fps: Record<string, string> = {}
    for (const x of all) {
      const st = alertStatus(x, stateOf.get(x.key), now)
      if (st !== "hidden") { status[x.key] = st; fps[x.key] = x.fp }
    }
    const shown = (k: string) => k in status
    const lowShown = lowStock.filter((p) => shown(lowKey(p).key))
    const expShown = expiring.filter((p) => shown(expKey(p).key))

    return NextResponse.json({
      lowStock: lowShown.slice(0, MAX_ITEMS).map((p) => ({ ...p, key: lowKey(p).key })),
      expiring: expShown.slice(0, MAX_ITEMS).map((p) => ({ ...p, key: expKey(p).key })),
      totals: { lowStock: lowShown.length, expiring: expShown.length },
      trialEndingSoon: shown("trial") ? trialEndingSoon : null,
      needsPrice: shown("price") ? needsPrice : 0,
      toCall: shown("call") ? toCall : 0,
      devicesWaiting: devicesWaiting === undefined ? undefined : shown("devices") ? devicesWaiting : 0,
      stockTake: stockTake && { waiting: shown("st-wait") ? stockTake.waiting : 0, dueShelf: shown("st-due") ? stockTake.dueShelf : null },
      // key → "new" | "seen" for everything shown, and each one's version, so
      // the bell can mark them seen or dismiss exactly this version.
      status, fps,
    })
  })
}
