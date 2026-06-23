import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, gte, lte } from "drizzle-orm"
import { withTenant, sale, sale_item, product_stock } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"

// Nairobi is UTC+3
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000
function nairobiDate(utcMs: number) {
  return new Date(utcMs + TZ_OFFSET_MS).toISOString().slice(0, 10)
}
function dayBounds(dateStr: string): [Date, Date] {
  return [new Date(`${dateStr}T00:00:00+03:00`), new Date(`${dateStr}T23:59:59.999+03:00`)]
}

export async function GET(request: NextRequest) {
  const branchId = new URL(request.url).searchParams.get("branch_id")
  if (!branchId) return NextResponse.json({ error: "branch_id required" }, { status: 400 })

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const todayStr = nairobiDate(Date.now())
  const [todayStart, todayEnd] = dayBounds(todayStr)

  const last7: string[] = []
  for (let i = 6; i >= 0; i--) last7.push(nairobiDate(Date.now() - i * 86_400_000))
  const chartStart = new Date(`${last7[0]}T00:00:00+03:00`)
  const chartEnd = new Date(`${last7[6]}T23:59:59.999+03:00`)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)

  return withTenant(ctx, async (db) => {
    const sales = await db.select({
      id: sale.id, total_amount: sale.total_amount, payment_method: sale.payment_method,
      created_at: sale.created_at, receipt_number: sale.receipt_number,
    }).from(sale)
      .where(and(eq(sale.branch_id, branchId), eq(sale.status, "completed"), gte(sale.created_at, chartStart), lte(sale.created_at, chartEnd)))
      .orderBy(desc(sale.created_at))

    // KPIs — today only
    const todaySales = sales.filter((s) => s.created_at >= todayStart && s.created_at <= todayEnd)
    const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total_amount), 0)
    const todayTransactions = todaySales.length
    const todayAvgBasket = todayTransactions > 0 ? todayRevenue / todayTransactions : 0
    const todayMpesa = todaySales.filter((s) => s.payment_method === "mpesa" || s.payment_method === "split").reduce((sum, s) => sum + Number(s.total_amount), 0)
    const mpesaRate = todayRevenue > 0 ? (todayMpesa / todayRevenue) * 100 : 0

    // Chart — group by Nairobi date
    const byDate: Record<string, { date: string; total: number; cash: number; mpesa: number; transactions: number }> = {}
    for (const d of last7) byDate[d] = { date: d, total: 0, cash: 0, mpesa: 0, transactions: 0 }
    for (const s of sales) {
      const d = nairobiDate(new Date(s.created_at).getTime())
      if (!byDate[d]) continue
      byDate[d].total += Number(s.total_amount)
      byDate[d].transactions += 1
      if (s.payment_method === "cash") byDate[d].cash += Number(s.total_amount)
      if (s.payment_method === "mpesa" || s.payment_method === "split") byDate[d].mpesa += Number(s.total_amount)
    }
    const chartData = Object.values(byDate)

    const recentTransactions = sales.slice(0, 8).map((s) => ({
      id: s.id, receipt_number: s.receipt_number, total_amount: Number(s.total_amount),
      payment_method: s.payment_method, customer_name: null, created_at: s.created_at,
    }))

    // Top 5 products by revenue — last 30 days
    const topItems = await db.select({
      product_id: sale_item.product_id, product_name: sale_item.product_name,
      line_total: sale_item.line_total, quantity: sale_item.quantity,
    }).from(sale_item)
      .innerJoin(sale, eq(sale.id, sale_item.sale_id))
      .where(and(eq(sale.branch_id, branchId), eq(sale.status, "completed"), gte(sale.created_at, thirtyDaysAgo)))

    const productTotals: Record<string, { name: string; revenue: number; qty: number }> = {}
    for (const item of topItems) {
      const key = item.product_id ?? item.product_name
      const entry = productTotals[key] ?? { name: item.product_name, revenue: 0, qty: 0 }
      entry.revenue += Number(item.line_total)
      entry.qty += Number(item.quantity)
      productTotals[key] = entry
    }
    const topProducts = Object.entries(productTotals)
      .sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5)
      .map(([product_id, v]) => ({ product_id, ...v }))

    // Inventory alerts
    const stockData = await db.select({
      stock_on_hand: product_stock.stock_on_hand, reorder_level: product_stock.reorder_level, earliest_expiry: product_stock.earliest_expiry,
    }).from(product_stock).where(and(eq(product_stock.branch_id, branchId), eq(product_stock.is_active, true)))

    let outOfStock = 0, lowStock = 0, expiring = 0
    const warnMs = 90 * 86_400_000
    for (const p of stockData) {
      const stock = p.stock_on_hand ?? 0
      if (stock === 0) outOfStock++
      else if (stock <= (p.reorder_level ?? 10)) lowStock++
      if (p.earliest_expiry) {
        const days = new Date(p.earliest_expiry).getTime() - Date.now()
        if (days <= warnMs) expiring++
      }
    }

    return NextResponse.json({
      kpis: { todayRevenue, todayTransactions, todayAvgBasket, mpesaRate },
      chartData, topProducts, recentTransactions, alerts: { outOfStock, lowStock, expiring },
    })
  })
}
