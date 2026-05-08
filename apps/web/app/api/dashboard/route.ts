import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Nairobi is UTC+3
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000

function nairobiDate(utcMs: number) {
  return new Date(utcMs + TZ_OFFSET_MS).toISOString().slice(0, 10)
}

function dayBounds(dateStr: string): [string, string] {
  return [
    new Date(`${dateStr}T00:00:00+03:00`).toISOString(),
    new Date(`${dateStr}T23:59:59.999+03:00`).toISOString(),
  ]
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get("branch_id")

  if (!branchId) return NextResponse.json({ error: "branch_id required" }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const todayStr = nairobiDate(Date.now())
  const [todayStart, todayEnd] = dayBounds(todayStr)

  // Build last-7-days date array
  const last7: string[] = []
  for (let i = 6; i >= 0; i--) {
    last7.push(nairobiDate(Date.now() - i * 86_400_000))
  }
  const chartStart = new Date(`${last7[0]}T00:00:00+03:00`).toISOString()
  const chartEnd = new Date(`${last7[6]}T23:59:59.999+03:00`).toISOString()

  // Fetch all completed sales for today (KPIs) and last 7 days (chart) in one pass
  const { data: recentSales } = await supabase
    .from("sales")
    .select("id, total_amount, payment_method, status, created_at, receipt_number, customer_name")
    .eq("branch_id", branchId)
    .eq("status", "completed")
    .gte("created_at", chartStart)
    .lte("created_at", chartEnd)
    .order("created_at", { ascending: false })

  const sales = recentSales ?? []

  // KPIs — today only
  const todaySales = sales.filter(
    (s) => s.created_at >= todayStart && s.created_at <= todayEnd,
  )
  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total_amount), 0)
  const todayTransactions = todaySales.length
  const todayAvgBasket = todayTransactions > 0 ? todayRevenue / todayTransactions : 0
  const todayMpesa = todaySales
    .filter((s) => s.payment_method === "mpesa" || s.payment_method === "split")
    .reduce((sum, s) => sum + Number(s.total_amount), 0)
  const mpesaRate = todayRevenue > 0 ? (todayMpesa / todayRevenue) * 100 : 0

  // Chart — group by date
  const byDate: Record<string, { date: string; total: number; cash: number; mpesa: number; transactions: number }> = {}
  for (const d of last7) {
    byDate[d] = { date: d, total: 0, cash: 0, mpesa: 0, transactions: 0 }
  }
  for (const s of sales) {
    const d = nairobiDate(new Date(s.created_at).getTime())
    if (!byDate[d]) continue
    byDate[d].total += Number(s.total_amount)
    byDate[d].transactions += 1
    if (s.payment_method === "cash") byDate[d].cash += Number(s.total_amount)
    if (s.payment_method === "mpesa" || s.payment_method === "split") byDate[d].mpesa += Number(s.total_amount)
  }
  const chartData = Object.values(byDate)

  // Recent transactions (last 8, already ordered desc)
  const recentTransactions = sales.slice(0, 8).map((s) => ({
    id: s.id,
    receipt_number: s.receipt_number,
    total_amount: Number(s.total_amount),
    payment_method: s.payment_method,
    customer_name: s.customer_name,
    created_at: s.created_at,
  }))

  // Top 5 products by revenue — last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: topItems } = await supabase
    .from("sale_items")
    .select("product_id, product_name, line_total, quantity, sales!inner(branch_id, status, created_at)")
    .eq("sales.branch_id", branchId)
    .eq("sales.status", "completed")
    .gte("sales.created_at", thirtyDaysAgo)

  const productTotals: Record<string, { name: string; revenue: number; qty: number }> = {}
  for (const item of topItems ?? []) {
    const entry = productTotals[item.product_id] ?? { name: item.product_name, revenue: 0, qty: 0 }
    entry.revenue += Number(item.line_total)
    entry.qty += Number(item.quantity)
    productTotals[item.product_id] = entry
  }
  const topProducts = Object.entries(productTotals)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([product_id, v]) => ({ product_id, ...v }))

  // Inventory alerts
  const { data: stockData } = await supabase
    .from("product_stock")
    .select("stock_on_hand, reorder_level, earliest_expiry, is_active")
    .eq("branch_id", branchId)
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)

  let outOfStock = 0, lowStock = 0, expiring = 0
  const warnMs = 90 * 86_400_000
  for (const p of stockData ?? []) {
    const stock = p.stock_on_hand ?? 0
    if (stock === 0) outOfStock++
    else if (stock <= (p.reorder_level ?? 10)) lowStock++
    if (p.earliest_expiry) {
      const days = new Date(p.earliest_expiry).getTime() - Date.now()
      if (days <= warnMs) expiring++
    }
  }

  return NextResponse.json({
    kpis: {
      todayRevenue,
      todayTransactions,
      todayAvgBasket,
      mpesaRate,
    },
    chartData,
    topProducts,
    recentTransactions,
    alerts: { outOfStock, lowStock, expiring },
  })
}
