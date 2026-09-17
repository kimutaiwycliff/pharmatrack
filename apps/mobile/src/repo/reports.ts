import { and, eq, gte, lte, desc } from "drizzle-orm"
import { db } from "../db/database"
import { sales, saleItems, products, productBatches, staff } from "../db/schema"

// ADR-014 — local repo for Dashboard/Reports. Return shapes match the online
// API field-for-field. Aggregation is done in JS over fetched rows rather
// than SQL GROUP BY — a single pharmacy's local dataset is small enough that
// this is simpler to keep correct than hand-rolled SQL aggregates, the same
// "small dataset, aggregate in code" approach already used by
// repo/inventory.ts's listLocalInventory().

function dateKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function monthKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Batch cost first, falling back to the product's own cost_price — matches
 *  CLAUDE.md's "gross profit + margin (batch cost → fallback to product
 *  cost)" rule exactly. */
async function costCentsForItem(it: typeof saleItems.$inferSelect): Promise<number> {
  if (it.batchId) {
    const [batch] = await db.select({ costPriceCents: productBatches.costPriceCents }).from(productBatches).where(eq(productBatches.id, it.batchId)).limit(1)
    if (batch?.costPriceCents != null) return batch.costPriceCents * it.quantity
  }
  if (it.productId) {
    const [product] = await db.select({ costPrice: products.costPrice }).from(products).where(eq(products.productId, it.productId)).limit(1)
    if (product?.costPrice != null) return Math.round(product.costPrice * 100) * it.quantity
  }
  return 0
}

export async function getLocalDashboard(branchId: string) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(todayStart); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

  const recentSales = await db.select().from(sales)
    .where(and(eq(sales.branchId, branchId), gte(sales.createdAt, sevenDaysAgo.getTime())))
    .orderBy(desc(sales.createdAt))

  const todaySales = recentSales.filter((s) => s.createdAt >= todayStart.getTime())
  const todayRevenueCents = todaySales.reduce((sum, s) => sum + s.totalAmountCents, 0)
  const mpesaCount = todaySales.filter((s) => s.paymentMethod === "mpesa" || s.paymentMethod === "split").length

  const chartMap = new Map<string, { total: number; cash: number; mpesa: number; transactions: number }>()
  for (const s of recentSales) {
    const key = dateKey(s.createdAt)
    const entry = chartMap.get(key) ?? { total: 0, cash: 0, mpesa: 0, transactions: 0 }
    entry.total += s.totalAmountCents
    if (s.paymentMethod === "cash") entry.cash += s.totalAmountCents
    if (s.paymentMethod === "mpesa" || s.paymentMethod === "split") entry.mpesa += s.totalAmountCents
    entry.transactions += 1
    chartMap.set(key, entry)
  }
  const chartData = Array.from(chartMap.entries()).map(([date, v]) => ({
    date, total: v.total / 100, cash: v.cash / 100, mpesa: v.mpesa / 100, transactions: v.transactions,
  })).sort((a, b) => a.date.localeCompare(b.date))

  const itemsByProduct = new Map<string, { name: string; revenue: number; qty: number }>()
  for (const s of todaySales) {
    const items = await db.select().from(saleItems).where(eq(saleItems.saleId, s.id))
    for (const it of items) {
      const key = it.productId ?? it.productName
      const entry = itemsByProduct.get(key) ?? { name: it.productName, revenue: 0, qty: 0 }
      entry.revenue += it.lineTotalCents
      entry.qty += it.quantity
      itemsByProduct.set(key, entry)
    }
  }
  const topProducts = Array.from(itemsByProduct.entries())
    .map(([product_id, v]) => ({ product_id, name: v.name, revenue: v.revenue / 100, qty: v.qty }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const recentTransactions = recentSales.slice(0, 10).map((s) => ({
    id: s.id, receipt_number: s.receiptNumber ?? "", total_amount: s.totalAmountCents / 100,
    payment_method: s.paymentMethod, customer_name: s.customerName, created_at: new Date(s.createdAt).toISOString(),
  }))

  const allProducts = await db.select().from(products)
  const outOfStock = allProducts.filter((p) => (p.stockOnHand ?? 0) <= 0).length
  const lowStock = allProducts.filter((p) => (p.stockOnHand ?? 0) > 0 && p.stockOnHand! <= p.reorderLevel).length
  const expiring = allProducts.filter((p) => p.earliestExpiry && Math.ceil((new Date(p.earliestExpiry).getTime() - Date.now()) / 86_400_000) <= 90).length

  return {
    kpis: {
      todayRevenue: todayRevenueCents / 100,
      todayTransactions: todaySales.length,
      todayAvgBasket: todaySales.length > 0 ? todayRevenueCents / 100 / todaySales.length : 0,
      mpesaRate: todaySales.length > 0 ? mpesaCount / todaySales.length : 0,
    },
    chartData, topProducts, recentTransactions,
    alerts: { outOfStock, lowStock, expiring },
  }
}

export async function getLocalReport(opts: { type: "sales" | "inventory" | "financial"; from?: string; to?: string; branchId?: string | null }) {
  if (opts.type === "inventory") {
    const rows = await db.select().from(products)
    const items = rows.map((p) => {
      const days = p.earliestExpiry ? Math.ceil((new Date(p.earliestExpiry).getTime() - Date.now()) / 86_400_000) : null
      let status: "out_of_stock" | "low_stock" | "expiring" | "ok" = "ok"
      if ((p.stockOnHand ?? 0) <= 0) status = "out_of_stock"
      else if (p.stockOnHand! <= p.reorderLevel) status = "low_stock"
      else if (days != null && days <= 90) status = "expiring"
      return {
        product_id: p.productId, name: p.name, brand_name: p.brandName, strength: p.strength, dosage_form: p.dosageForm,
        stock_on_hand: p.stockOnHand, reorder_level: p.reorderLevel, base_unit: p.baseUnit, expiry_days: days,
        is_controlled: p.isControlled, selling_price: p.sellingPrice, cost_price: p.costPrice ?? null, status,
      }
    })
    return {
      summary: {
        totalSKUs: items.length,
        outOfStock: items.filter((i) => i.status === "out_of_stock").length,
        lowStock: items.filter((i) => i.status === "low_stock").length,
        expiring: items.filter((i) => i.status === "expiring").length,
        controlled: items.filter((i) => i.is_controlled).length,
      },
      items,
    }
  }

  const clauses = []
  if (opts.branchId) clauses.push(eq(sales.branchId, opts.branchId))
  if (opts.from) clauses.push(gte(sales.createdAt, new Date(opts.from).getTime()))
  if (opts.to) clauses.push(lte(sales.createdAt, new Date(opts.to).getTime()))
  const rows = clauses.length > 0 ? await db.select().from(sales).where(and(...clauses)) : await db.select().from(sales)

  if (opts.type === "financial") {
    const totalRevenue = rows.reduce((s, r) => s + r.totalAmountCents, 0)
    const totalDiscounts = rows.reduce((s, r) => s + r.discountAmountCents, 0)
    let totalCostCents = 0
    for (const s of rows) {
      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, s.id))
      for (const it of items) totalCostCents += await costCentsForItem(it)
    }
    const monthMap = new Map<string, { revenue: number; discounts: number; count: number }>()
    for (const s of rows) {
      const key = monthKey(s.createdAt)
      const entry = monthMap.get(key) ?? { revenue: 0, discounts: 0, count: 0 }
      entry.revenue += s.totalAmountCents; entry.discounts += s.discountAmountCents; entry.count += 1
      monthMap.set(key, entry)
    }
    const monthlyChart = Array.from(monthMap.entries()).map(([month, v]) => ({
      month, revenue: v.revenue / 100, discounts: v.discounts / 100, count: v.count, profit: (v.revenue - v.discounts) / 100,
    })).sort((a, b) => a.month.localeCompare(b.month))
    return {
      summary: {
        totalRevenue: totalRevenue / 100, totalDiscounts: totalDiscounts / 100, transactions: rows.length,
        avgOrderValue: rows.length > 0 ? totalRevenue / 100 / rows.length : 0,
        totalProfit: (totalRevenue - totalCostCents) / 100,
      },
      monthlyChart,
    }
  }

  // sales report
  const totalRevenue = rows.reduce((s, r) => s + r.totalAmountCents, 0)
  const totalCash = rows.filter((r) => r.paymentMethod === "cash").reduce((s, r) => s + r.totalAmountCents, 0)
  const totalMpesa = rows.filter((r) => r.paymentMethod === "mpesa").reduce((s, r) => s + r.totalAmountCents, 0)
  const totalDiscount = rows.reduce((s, r) => s + r.discountAmountCents, 0)

  const dailyMap = new Map<string, { revenue: number; cash: number; mpesa: number; count: number }>()
  const cashierMap = new Map<string, { revenue: number; count: number }>()
  const productMap = new Map<string, { name: string; qty: number; revenue: number; cost: number }>()
  let totalCostCents = 0

  const staffNameCache = new Map<string, string>()
  async function cashierName(cashierId: string | null): Promise<string> {
    if (!cashierId) return "—"
    if (staffNameCache.has(cashierId)) return staffNameCache.get(cashierId)!
    const [row] = await db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.id, cashierId)).limit(1)
    const name = row?.fullName ?? "—"
    staffNameCache.set(cashierId, name)
    return name
  }

  for (const s of rows) {
    const dKey = dateKey(s.createdAt)
    const dEntry = dailyMap.get(dKey) ?? { revenue: 0, cash: 0, mpesa: 0, count: 0 }
    dEntry.revenue += s.totalAmountCents
    if (s.paymentMethod === "cash") dEntry.cash += s.totalAmountCents
    if (s.paymentMethod === "mpesa") dEntry.mpesa += s.totalAmountCents
    dEntry.count += 1
    dailyMap.set(dKey, dEntry)

    const name = await cashierName(s.cashierId)
    const cEntry = cashierMap.get(name) ?? { revenue: 0, count: 0 }
    cEntry.revenue += s.totalAmountCents; cEntry.count += 1
    cashierMap.set(name, cEntry)

    const items = await db.select().from(saleItems).where(eq(saleItems.saleId, s.id))
    for (const it of items) {
      const costCents = await costCentsForItem(it)
      totalCostCents += costCents
      const key = it.productId ?? it.productName
      const pEntry = productMap.get(key) ?? { name: it.productName, qty: 0, revenue: 0, cost: 0 }
      pEntry.qty += it.quantity; pEntry.revenue += it.lineTotalCents; pEntry.cost += costCents
      productMap.set(key, pEntry)
    }
  }

  const transactions = await Promise.all(rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map(async (s) => {
    const itemCount = (await db.select().from(saleItems).where(eq(saleItems.saleId, s.id))).length
    return {
      id: s.id, receipt_number: s.receiptNumber ?? "", created_at: new Date(s.createdAt).toISOString(),
      payment_method: s.paymentMethod, total_amount: s.totalAmountCents / 100, discount_amount: s.discountAmountCents / 100,
      cashier: await cashierName(s.cashierId), item_count: itemCount,
    }
  }))

  return {
    summary: {
      totalRevenue: totalRevenue / 100, totalCash: totalCash / 100, totalMpesa: totalMpesa / 100,
      totalDiscount: totalDiscount / 100, transactionCount: rows.length,
      totalCost: totalCostCents / 100, totalProfit: (totalRevenue - totalCostCents) / 100,
    },
    dailyChart: Array.from(dailyMap.entries()).map(([date, v]) => ({
      date, revenue: v.revenue / 100, cash: v.cash / 100, mpesa: v.mpesa / 100, count: v.count,
    })).sort((a, b) => a.date.localeCompare(b.date)),
    byCashier: Array.from(cashierMap.entries()).map(([name, v]) => ({ name, revenue: v.revenue / 100, count: v.count })),
    topProducts: Array.from(productMap.entries()).map(([, v]) => ({
      name: v.name, qty: v.qty, revenue: v.revenue / 100, cost: v.cost / 100,
      profit: (v.revenue - v.cost) / 100, margin: v.revenue > 0 ? (v.revenue - v.cost) / v.revenue : null,
    })).sort((a, b) => b.revenue - a.revenue),
    transactions,
  }
}
