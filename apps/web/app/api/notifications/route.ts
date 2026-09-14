import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withTenant, product_stock, subscription } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"

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
  const branchId = new URL(request.url).searchParams.get("branch_id")
  if (!branchId) return NextResponse.json({ error: "branch_id required" }, { status: 400 })

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  return withTenant(ctx, async (db) => {
    const stockRows = await db.select({
      product_id: product_stock.product_id,
      name: product_stock.name,
      stock_on_hand: product_stock.stock_on_hand,
      reorder_level: product_stock.reorder_level,
      earliest_expiry: product_stock.earliest_expiry,
    }).from(product_stock)
      .where(and(eq(product_stock.branch_id, branchId), eq(product_stock.is_active, true)))

    const now = Date.now()
    const warnMs = EXPIRY_WARN_DAYS * 86_400_000

    const lowStock = stockRows
      .filter((p) => (p.stock_on_hand ?? 0) <= (p.reorder_level ?? 10))
      .sort((a, b) => (a.stock_on_hand ?? 0) - (b.stock_on_hand ?? 0))
      .slice(0, MAX_ITEMS)
      .map((p) => ({
        product_id: p.product_id,
        name: p.name,
        stock_on_hand: p.stock_on_hand ?? 0,
        reorder_level: p.reorder_level ?? 10,
      }))

    const expiring = stockRows
      .filter((p) => p.earliest_expiry && new Date(p.earliest_expiry).getTime() - now <= warnMs)
      .sort((a, b) => new Date(a.earliest_expiry!).getTime() - new Date(b.earliest_expiry!).getTime())
      .slice(0, MAX_ITEMS)
      .map((p) => ({
        product_id: p.product_id,
        name: p.name,
        earliest_expiry: p.earliest_expiry,
        daysUntil: Math.max(0, Math.ceil((new Date(p.earliest_expiry!).getTime() - now) / 86_400_000)),
      }))

    let trialEndingSoon: { trial_ends_at: string; daysLeft: number } | null = null
    if (ctx.role === "owner") {
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

    return NextResponse.json({ lowStock, expiring, trialEndingSoon })
  })
}
