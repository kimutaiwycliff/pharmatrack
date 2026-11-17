import { NextRequest, NextResponse } from "next/server"
import { and, eq, gte, lte, desc, ilike, inArray, sql } from "drizzle-orm"
import { withTenant, sale, sale_item, user } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { apiError, zodErrorResponse } from "@/lib/api/errors"
import { resolveBranchScope } from "@/lib/inventory/aggregate"
import { createSale, saleErrorResponse, saleSchema } from "@/lib/sales/create-sale"
import { mustUseCashier } from "@/lib/cashier-station/guard"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get("branch_id")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const q = searchParams.get("q")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))

  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  // null → "All branches"; branch-locked staff are always pinned to their own.
  const scopedBranch = resolveBranchScope(ctx, branchId)

  return withTenant(ctx, async (db) => {
    const where = and(
      scopedBranch ? eq(sale.branch_id, scopedBranch) : undefined,
      eq(sale.status, "completed"),
      !ctx.permissions.includes("sales.view_all") ? eq(sale.cashier_id, ctx.userId) : undefined,
      from ? gte(sale.created_at, new Date(from)) : undefined,
      to ? lte(sale.created_at, new Date(to)) : undefined,
      q ? ilike(sale.receipt_number, `%${q}%`) : undefined,
    )

    const all = await db.select({
      row: sale, cashier_name: user.name,
    }).from(sale)
      .leftJoin(user, eq(user.id, sale.cashier_id))
      .where(where).orderBy(desc(sale.created_at))

    const total = all.length
    const offset = (page - 1) * limit
    const pageRows = all.slice(offset, offset + limit)
    const saleIds = pageRows.map((r) => r.row.id)

    const itemCounts: Record<string, number> = {}
    if (saleIds.length > 0) {
      const counts = await db.select({ sale_id: sale_item.sale_id, n: sql<number>`count(*)::int` })
        .from(sale_item).where(inArray(sale_item.sale_id, saleIds)).groupBy(sale_item.sale_id)
      for (const c of counts) itemCounts[c.sale_id] = c.n
    }

    const sales = pageRows.map(({ row, cashier_name }) => ({
      ...row,
      subtotal: Number(row.subtotal), discount_amount: Number(row.discount_amount),
      tax_amount: Number(row.tax_amount), total_amount: Number(row.total_amount),
      cashier_name: cashier_name ?? "—",
      item_count: itemCounts[row.id] ?? 0,
    }))

    return NextResponse.json({ sales, total, page, limit })
  })
}


export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  if (!ctx.permissions.includes("pos.sell")) return apiError("You don't have permission to sell", 403)

  const parsed = saleSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)
  // Cashier station branches (ADR-021): order desks send orders to the cashier.
  if (await mustUseCashier(ctx, parsed.data.branch_id, parsed.data.offline_reference)) {
    return NextResponse.json(
      { error: "This branch pays at the cashier — send the order to the cashier instead.", code: "use_cashier" },
      { status: 403 },
    )
  }
  // No discount permission → any submitted discount is clamped to zero, the
  // same "clamp, never trust upward" rule the per-product cap uses.
  const actor = { organizationId: ctx.organizationId, userId: ctx.userId, mayDiscount: ctx.permissions.includes("pos.discount") }

  let out
  try {
    out = await withTenant(ctx, (db) => createSale(db, actor, parsed.data))
  } catch (e) {
    const res = saleErrorResponse(e)
    if (res) return res
    throw e
  }

  return NextResponse.json(out, { status: 201 })
}
