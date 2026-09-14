import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { withTenant, sale, sale_item, product_stock } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { canViewCost, omitCost } from "@/lib/auth/costVisibility"

const num = (v: string | number | null) => (v == null ? null : Number(v))
const WINDOW_DAYS = 90
const LIMIT = 12

// Learned "most sold" products for a branch (last 90 days), so the POS quick-add
// grid surfaces what customers actually buy. Falls back to nothing when there are
// no sales yet (the POS then fills the grid with the catalogue).
export async function GET(request: NextRequest) {
  const branchId = new URL(request.url).searchParams.get("branch_id")
  if (!branchId) return NextResponse.json({ products: [] })

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)

  const products = await withTenant(ctx, async (db) => {
    const ranked = await db
      .select({ product_id: sale_item.product_id, sold: sql<number>`sum(${sale_item.quantity})::int` })
      .from(sale_item)
      .innerJoin(sale, eq(sale.id, sale_item.sale_id))
      .where(and(eq(sale.branch_id, branchId), eq(sale.status, "completed"), gte(sale.created_at, since)))
      .groupBy(sale_item.product_id)
      .orderBy(desc(sql`sum(${sale_item.quantity})`))
      .limit(LIMIT)

    const ids = ranked.map((r) => r.product_id).filter((x): x is string => !!x)
    if (ids.length === 0) return []

    const rows = await db.select().from(product_stock)
      .where(and(
        eq(product_stock.branch_id, branchId),
        eq(product_stock.is_active, true),
        inArray(product_stock.product_id, ids),
      ))

    // Preserve the most-sold ordering.
    const rank = new Map(ids.map((id, i) => [id, i]))
    const withPrices = rows
      .sort((a, b) => (rank.get(a.product_id!) ?? 99) - (rank.get(b.product_id!) ?? 99))
      .map((p) => ({
        ...p,
        selling_price: num(p.selling_price), cost_price: num(p.cost_price),
        max_discount_percent: num(p.max_discount_percent),
      }))
    return canViewCost(ctx.role) ? withPrices : withPrices.map(omitCost)
  })

  return NextResponse.json({ products })
}
