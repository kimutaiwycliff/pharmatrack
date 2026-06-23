import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, gte, inArray, lt, asc } from "drizzle-orm"
import { withTenant, sale, sale_item, product, product_batch, product_stock, user, branch } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { requireFeatureApi } from "@/lib/entitlements"

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000
function toNairobiDate(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const report = searchParams.get("report") ?? "sales"
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const branchId = searchParams.get("branch_id")

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(["owner", "manager"] as Role[]).includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const locked = await requireFeatureApi(ctx.organizationId, "reports")
  if (locked) return locked

  // Nairobi date strings → UTC instants. RLS already scopes to the org, so when no
  // branch is given we simply omit the branch filter (all org branches).
  const fromUtc = from ? new Date(new Date(from).getTime() - TZ_OFFSET_MS) : null
  const toUtcExclusive = to ? new Date(new Date(to).getTime() - TZ_OFFSET_MS + 86_400_000) : null

  return withTenant(ctx, async (db) => {
    if (report === "sales") {
      const sales = await db.select({
        id: sale.id, created_at: sale.created_at, receipt_number: sale.receipt_number,
        payment_method: sale.payment_method, total_amount: sale.total_amount, discount_amount: sale.discount_amount,
        cashier_name: user.name, branch_name: branch.name,
      }).from(sale)
        .leftJoin(user, eq(user.id, sale.cashier_id))
        .leftJoin(branch, eq(branch.id, sale.branch_id))
        .where(and(
          eq(sale.status, "completed"),
          branchId ? eq(sale.branch_id, branchId) : undefined,
          fromUtc ? gte(sale.created_at, fromUtc) : undefined,
          toUtcExclusive ? lt(sale.created_at, toUtcExclusive) : undefined,
        )).orderBy(desc(sale.created_at))

      const saleIds = sales.map((s) => s.id)
      const items = saleIds.length
        ? await db.select({
            sale_id: sale_item.sale_id, product_name: sale_item.product_name, quantity: sale_item.quantity,
            line_total: sale_item.line_total, product_cost: product.cost_price, batch_cost: product_batch.cost_price,
          }).from(sale_item)
            .leftJoin(product, eq(product.id, sale_item.product_id))
            .leftJoin(product_batch, eq(product_batch.id, sale_item.batch_id))
            .where(inArray(sale_item.sale_id, saleIds))
        : []

      const itemsBySale: Record<string, typeof items> = {}
      for (const it of items) {
        if (!it.sale_id) continue
        ;(itemsBySale[it.sale_id] ??= []).push(it)
      }

      const byDay: Record<string, { revenue: number; cash: number; mpesa: number; count: number }> = {}
      const byCashier: Record<string, { name: string; revenue: number; count: number }> = {}
      let totalRevenue = 0, totalCash = 0, totalMpesa = 0, totalDiscount = 0, transactionCount = 0
      const totalSplit = 0

      for (const s of sales) {
        const amt = Number(s.total_amount), disc = Number(s.discount_amount)
        const day = toNairobiDate(s.created_at)
        if (!byDay[day]) byDay[day] = { revenue: 0, cash: 0, mpesa: 0, count: 0 }
        byDay[day].revenue += amt; byDay[day].count++
        if (s.payment_method === "cash" || s.payment_method === "split") byDay[day].cash += amt
        if (s.payment_method === "mpesa" || s.payment_method === "split") byDay[day].mpesa += amt

        const cashierName = s.cashier_name ?? "Unknown"
        if (!byCashier[cashierName]) byCashier[cashierName] = { name: cashierName, revenue: 0, count: 0 }
        byCashier[cashierName].revenue += amt; byCashier[cashierName].count++

        totalRevenue += amt; totalDiscount += disc; transactionCount++
        if (s.payment_method === "cash") totalCash += amt
        else if (s.payment_method === "mpesa") totalMpesa += amt
        else if (s.payment_method === "split") { totalCash += amt / 2; totalMpesa += amt / 2 }
      }

      // Top products with cost & profit. Cost basis: actual batch sold, falling back
      // to the product's current cost. Profit = revenue (post-discount) − cost.
      const unitCost = (it: { batch_cost: string | null; product_cost: string | null }): number | null => {
        if (it.batch_cost != null) return Number(it.batch_cost)
        return it.product_cost != null ? Number(it.product_cost) : null
      }
      const itemTotals: Record<string, { name: string; qty: number; revenue: number; cost: number; profit: number; costKnown: boolean }> = {}
      let totalCost = 0, totalProfit = 0
      for (const it of items) {
        const lt2 = Number(it.line_total)
        const e = (itemTotals[it.product_name] ??= { name: it.product_name, qty: 0, revenue: 0, cost: 0, profit: 0, costKnown: true })
        e.qty += it.quantity; e.revenue += lt2
        const uc = unitCost(it)
        if (uc == null) e.costKnown = false
        else { const lineCost = uc * it.quantity; e.cost += lineCost; e.profit += lt2 - lineCost; totalCost += lineCost; totalProfit += lt2 - lineCost }
      }
      const topProducts = Object.values(itemTotals).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
        .map((p) => ({ name: p.name, qty: p.qty, revenue: p.revenue, cost: p.cost, profit: p.profit, margin: p.costKnown && p.revenue > 0 ? p.profit / p.revenue : null }))

      const dailyChart = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }))

      return NextResponse.json({
        summary: { totalRevenue, totalCash, totalMpesa, totalSplit, totalDiscount, transactionCount, totalCost, totalProfit },
        dailyChart,
        byCashier: Object.values(byCashier).sort((a, b) => b.revenue - a.revenue),
        topProducts,
        transactions: sales.slice(0, 100).map((s) => ({
          id: s.id, receipt_number: s.receipt_number, created_at: s.created_at, payment_method: s.payment_method,
          total_amount: Number(s.total_amount), discount_amount: Number(s.discount_amount),
          cashier: s.cashier_name ?? "—", branch: s.branch_name ?? "—", item_count: (itemsBySale[s.id] ?? []).length,
        })),
      })
    }

    if (report === "inventory") {
      const stock = await db.select().from(product_stock)
        .where(and(eq(product_stock.is_active, true), branchId ? eq(product_stock.branch_id, branchId) : undefined))
        .orderBy(asc(product_stock.name))

      const now = Date.now()
      const num = (v: string | number | null) => (v == null ? null : Number(v))
      const rows = stock.map((p) => {
        const days = p.earliest_expiry ? Math.ceil((new Date(p.earliest_expiry).getTime() - now) / 86_400_000) : null
        return {
          ...p, selling_price: num(p.selling_price), cost_price: num(p.cost_price), max_discount_percent: num(p.max_discount_percent),
          expiry_days: days,
          status: (p.stock_on_hand ?? 0) === 0 ? "out_of_stock"
            : (p.stock_on_hand ?? 0) <= (p.reorder_level ?? 10) ? "low_stock"
            : days !== null && days <= 90 ? "expiring" : "ok",
        }
      })

      return NextResponse.json({
        summary: {
          totalSKUs: rows.length,
          outOfStock: rows.filter((r) => r.status === "out_of_stock").length,
          lowStock: rows.filter((r) => r.status === "low_stock").length,
          expiring: rows.filter((r) => r.status === "expiring").length,
          controlled: rows.filter((r) => r.is_controlled).length,
        },
        items: rows,
      })
    }

    if (report === "financial") {
      const sales = await db.select({
        id: sale.id, total_amount: sale.total_amount, discount_amount: sale.discount_amount,
        payment_method: sale.payment_method, created_at: sale.created_at,
      }).from(sale).where(and(
        eq(sale.status, "completed"),
        branchId ? eq(sale.branch_id, branchId) : undefined,
        fromUtc ? gte(sale.created_at, fromUtc) : undefined,
        toUtcExclusive ? lt(sale.created_at, toUtcExclusive) : undefined,
      ))

      const saleIds = sales.map((s) => s.id)
      const items = saleIds.length
        ? await db.select({
            sale_id: sale_item.sale_id, quantity: sale_item.quantity, line_total: sale_item.line_total,
            product_cost: product.cost_price, batch_cost: product_batch.cost_price,
          }).from(sale_item)
            .leftJoin(product, eq(product.id, sale_item.product_id))
            .leftJoin(product_batch, eq(product_batch.id, sale_item.batch_id))
            .where(inArray(sale_item.sale_id, saleIds))
        : []

      const profitBySale: Record<string, number> = {}
      for (const it of items) {
        if (!it.sale_id) continue
        const cost = it.batch_cost ?? it.product_cost
        const lineProfit = cost == null ? 0 : Number(it.line_total) - Number(cost) * it.quantity
        profitBySale[it.sale_id] = (profitBySale[it.sale_id] ?? 0) + lineProfit
      }

      let totalRevenue = 0, totalDiscounts = 0, transactions = 0, totalProfit = 0
      const monthlyMap: Record<string, { revenue: number; discounts: number; count: number; profit: number }> = {}
      for (const s of sales) {
        const amt = Number(s.total_amount), disc = Number(s.discount_amount)
        totalRevenue += amt; totalDiscounts += disc; transactions++
        const saleProfit = profitBySale[s.id] ?? 0
        totalProfit += saleProfit
        const month = toNairobiDate(s.created_at).slice(0, 7)
        if (!monthlyMap[month]) monthlyMap[month] = { revenue: 0, discounts: 0, count: 0, profit: 0 }
        monthlyMap[month].revenue += amt; monthlyMap[month].discounts += disc; monthlyMap[month].profit += saleProfit; monthlyMap[month].count++
      }

      return NextResponse.json({
        summary: { totalRevenue, totalDiscounts, transactions, avgOrderValue: transactions > 0 ? totalRevenue / transactions : 0, totalProfit },
        monthlyChart: Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
      })
    }

    return NextResponse.json({ error: "Unknown report type" }, { status: 400 })
  })
}
