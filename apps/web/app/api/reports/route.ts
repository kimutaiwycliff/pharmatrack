import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000

function toNairobiDate(isoString: string): string {
  const d = new Date(new Date(isoString).getTime() + TZ_OFFSET_MS)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const report = searchParams.get("report") ?? "sales"
  const from = searchParams.get("from") // YYYY-MM-DD (Nairobi)
  const to = searchParams.get("to")     // YYYY-MM-DD (Nairobi)
  const branchId = searchParams.get("branch_id")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles").select("organization_id, role").eq("id", user.id).single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  if (!["owner", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Convert Nairobi date strings → UTC ISO timestamps for DB queries
  const fromUtc = from ? new Date(new Date(from).getTime() - TZ_OFFSET_MS).toISOString() : null
  const toUtcExclusive = to
    ? new Date(new Date(to).getTime() - TZ_OFFSET_MS + 86_400_000).toISOString()
    : null

  if (report === "sales") {
    let q = supabase
      .from("sales")
      .select(`
        id, created_at, receipt_number, payment_method, total_amount,
        discount_amount, status,
        cashier:profiles!cashier_id(full_name),
        branch:branches!branch_id(name),
        sale_items(product_name, quantity, unit_price, line_total, discount_percent)
      `)
      .eq("status", "completed")
      .order("created_at", { ascending: false })

    if (branchId) q = q.eq("branch_id", branchId)
    else {
      // fetch all branches for this org
      const { data: branches } = await supabase
        .from("branches").select("id").eq("organization_id", profile.organization_id)
      const ids = (branches ?? []).map((b: { id: string }) => b.id)
      if (ids.length) q = q.in("branch_id", ids)
    }
    if (fromUtc) q = q.gte("created_at", fromUtc)
    if (toUtcExclusive) q = q.lt("created_at", toUtcExclusive)

    const { data: sales, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Aggregate by Nairobi date
    const byDay: Record<string, { revenue: number; cash: number; mpesa: number; count: number }> = {}
    // Aggregate by cashier
    const byCashier: Record<string, { name: string; revenue: number; count: number }> = {}
    // Aggregate by payment method
    let totalRevenue = 0, totalCash = 0, totalMpesa = 0, totalSplit = 0, totalDiscount = 0
    let transactionCount = 0

    for (const s of sales ?? []) {
      const day = toNairobiDate(s.created_at)
      if (!byDay[day]) byDay[day] = { revenue: 0, cash: 0, mpesa: 0, count: 0 }
      byDay[day].revenue += s.total_amount
      byDay[day].count++
      if (s.payment_method === "cash" || s.payment_method === "split") byDay[day].cash += s.total_amount
      if (s.payment_method === "mpesa" || s.payment_method === "split") byDay[day].mpesa += s.total_amount

      const cashierRow = s.cashier as { full_name: string } | null
      const cashierName = cashierRow?.full_name ?? "Unknown"
      const cashierId = String(s.id).slice(0, 8) + cashierName // use name as key
      if (!byCashier[cashierName]) byCashier[cashierName] = { name: cashierName, revenue: 0, count: 0 }
      byCashier[cashierName].revenue += s.total_amount
      byCashier[cashierName].count++

      totalRevenue += s.total_amount
      totalDiscount += s.discount_amount
      transactionCount++
      if (s.payment_method === "cash") totalCash += s.total_amount
      else if (s.payment_method === "mpesa") totalMpesa += s.total_amount
      else if (s.payment_method === "split") { totalCash += s.total_amount / 2; totalMpesa += s.total_amount / 2 }
    }

    // Top products from sale_items
    const itemTotals: Record<string, { name: string; qty: number; revenue: number }> = {}
    for (const s of sales ?? []) {
      for (const item of (s.sale_items as Array<{ product_name: string; quantity: number; line_total: number; discount_percent: number }> | null) ?? []) {
        if (!itemTotals[item.product_name]) itemTotals[item.product_name] = { name: item.product_name, qty: 0, revenue: 0 }
        const entry = itemTotals[item.product_name]!
        entry.qty += item.quantity
        entry.revenue += item.line_total
      }
    }
    const topProducts = Object.values(itemTotals)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    const dailyChart = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))

    return NextResponse.json({
      summary: { totalRevenue, totalCash, totalMpesa, totalSplit, totalDiscount, transactionCount },
      dailyChart,
      byCashier: Object.values(byCashier).sort((a, b) => b.revenue - a.revenue),
      topProducts,
      transactions: (sales ?? []).slice(0, 100).map(s => ({
        id: s.id,
        receipt_number: s.receipt_number,
        created_at: s.created_at,
        payment_method: s.payment_method,
        total_amount: s.total_amount,
        discount_amount: s.discount_amount,
        cashier: (s.cashier as { full_name: string } | null)?.full_name ?? "—",
        branch: (s.branch as { name: string } | null)?.name ?? "—",
        item_count: ((s.sale_items as unknown[]) ?? []).length,
      })),
    })
  }

  if (report === "inventory") {
    // Fetch all org branches if no specific branchId
    let branchIds: string[] = []
    if (branchId) {
      branchIds = [branchId]
    } else {
      const { data: branches } = await supabase
        .from("branches").select("id").eq("organization_id", profile.organization_id)
      branchIds = (branches ?? []).map((b: { id: string }) => b.id)
    }

    const { data: stock, error } = await supabase
      .from("product_stock")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .in("branch_id", branchIds)
      .order("name", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const now = Date.now()
    const rows = (stock ?? []).map(p => {
      const days = p.earliest_expiry
        ? Math.ceil((new Date(p.earliest_expiry).getTime() - now) / 86_400_000)
        : null
      return {
        ...p,
        expiry_days: days,
        status: (p.stock_on_hand ?? 0) === 0 ? "out_of_stock"
          : (p.stock_on_hand ?? 0) <= (p.reorder_level ?? 10) ? "low_stock"
          : days !== null && days <= 90 ? "expiring"
          : "ok",
      }
    })

    const totalSKUs = rows.length
    const outOfStock = rows.filter(r => r.status === "out_of_stock").length
    const lowStock = rows.filter(r => r.status === "low_stock").length
    const expiring = rows.filter(r => r.status === "expiring").length
    const controlled = rows.filter(r => r.is_controlled).length

    return NextResponse.json({
      summary: { totalSKUs, outOfStock, lowStock, expiring, controlled },
      items: rows,
    })
  }

  if (report === "financial") {
    let q = supabase
      .from("sales")
      .select("total_amount, discount_amount, payment_method, created_at, sale_items(line_total, unit_price, quantity, product_name)")
      .eq("status", "completed")

    if (branchId) q = q.eq("branch_id", branchId)
    else {
      const { data: branches } = await supabase
        .from("branches").select("id").eq("organization_id", profile.organization_id)
      const ids = (branches ?? []).map((b: { id: string }) => b.id)
      if (ids.length) q = q.in("branch_id", ids)
    }
    if (fromUtc) q = q.gte("created_at", fromUtc)
    if (toUtcExclusive) q = q.lt("created_at", toUtcExclusive)

    const { data: sales, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let totalRevenue = 0, totalDiscounts = 0, transactions = 0
    const monthlyMap: Record<string, { revenue: number; discounts: number; count: number }> = {}

    for (const s of sales ?? []) {
      totalRevenue += s.total_amount
      totalDiscounts += s.discount_amount
      transactions++
      const month = toNairobiDate(s.created_at).slice(0, 7) // YYYY-MM
      if (!monthlyMap[month]) monthlyMap[month] = { revenue: 0, discounts: 0, count: 0 }
      monthlyMap[month].revenue += s.total_amount
      monthlyMap[month].discounts += s.discount_amount
      monthlyMap[month].count++
    }

    const avgOrderValue = transactions > 0 ? totalRevenue / transactions : 0
    const monthlyChart = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }))

    return NextResponse.json({
      summary: { totalRevenue, totalDiscounts, transactions, avgOrderValue },
      monthlyChart,
    })
  }

  return NextResponse.json({ error: "Unknown report type" }, { status: 400 })
}
