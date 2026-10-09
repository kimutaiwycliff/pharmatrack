import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm"
import {
  withTenant, product_stock, product, supplier, sale, sale_item, product_batch, purchase_order, purchase_order_item,
} from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { resolveBranchScope } from "@/lib/inventory/aggregate"
import { suggestRestock, type SuggestReason } from "@/lib/purchasing/suggest"
import type { RestockSuggestion } from "@/lib/purchasing/serialize"


const clampInt = (v: string | null, def: number, min: number, max: number) => {
  const n = parseInt(v ?? "", 10)
  return isNaN(n) ? def : Math.min(max, Math.max(min, n))
}

// GET /api/purchase-orders/suggestions?branch_id=&window=30&cover=30&cost=last|avg
export async function GET(request: NextRequest) {
  const ctx = await getApiContext({ permission: "purchasing.manage" })
  if ("error" in ctx) return ctx.error
  const sp = new URL(request.url).searchParams
  const branchId = resolveBranchScope(ctx, sp.get("branch_id"))
  if (!branchId) return NextResponse.json({ error: "Pick a branch to restock" }, { status: 400 })
  const windowDays = clampInt(sp.get("window"), 30, 7, 365)
  const coverDays = clampInt(sp.get("cover"), 30, 1, 180)
  const costBasis = sp.get("cost") === "avg" ? "avg" : "last"
  const canSeeCost = ctx.permissions.includes("cost.view")
  const since = new Date(Date.now() - windowDays * 86_400_000)

  return withTenant(ctx, async (db) => {
    const stock = await db.select({
      product_id: product_stock.product_id, name: product_stock.name, strength: product_stock.strength,
      base_unit: product_stock.base_unit, pack_label: product_stock.pack_label, units_per_pack: product_stock.units_per_pack,
      stock_on_hand: product_stock.stock_on_hand, reorder_level: product_stock.reorder_level, cost_price: product_stock.cost_price,
    }).from(product_stock)
      .where(and(eq(product_stock.branch_id, branchId), eq(product_stock.is_active, true)))

    const sold = await db.select({ product_id: sale_item.product_id, qty: sql<string>`sum(${sale_item.quantity})` })
      .from(sale_item).innerJoin(sale, eq(sale.id, sale_item.sale_id))
      .where(and(eq(sale.branch_id, branchId), eq(sale.status, "completed"), gte(sale.created_at, since), isNotNull(sale_item.product_id)))
      .groupBy(sale_item.product_id)
    const soldMap = new Map(sold.map((r) => [r.product_id!, Number(r.qty)]))

    // Base units still to arrive on open orders for this branch.
    const onOrderRows = await db.select({
      product_id: purchase_order_item.product_id,
      units: sql<string>`sum((${purchase_order_item.quantity_ordered} - ${purchase_order_item.quantity_received}) * ${purchase_order_item.units_per_pack})`,
    }).from(purchase_order_item).innerJoin(purchase_order, eq(purchase_order.id, purchase_order_item.purchase_order_id))
      .where(and(eq(purchase_order.branch_id, branchId), inArray(purchase_order.status, ["sent", "partially_received"]), isNotNull(purchase_order_item.product_id)))
      .groupBy(purchase_order_item.product_id)
    const onOrderMap = new Map(onOrderRows.map((r) => [r.product_id!, Math.max(0, Number(r.units))]))

    const candidates = stock.flatMap((s) => {
      if (!s.product_id) return []
      const upp = s.units_per_pack ?? 1
      const sug = suggestRestock({
        stockOnHand: s.stock_on_hand ?? 0, reorderLevel: s.reorder_level ?? 10,
        soldInWindow: soldMap.get(s.product_id) ?? 0, windowDays, coverDays,
        onOrder: onOrderMap.get(s.product_id) ?? 0, unitsPerPack: upp,
      })
      return sug.packs > 0 && sug.reason ? [{ s, sug, upp }] : []
    })
    const ids = candidates.map((c) => c.s.product_id!)
    if (ids.length === 0) return NextResponse.json({ suggestions: [], windowDays, coverDays, costBasis })

    // Supplier: the product's default, else whoever supplied its latest batch.
    const prodRows = await db.select({ id: product.id, supplier_id: product.supplier_id })
      .from(product).where(inArray(product.id, ids))
    const batchRows = await db.select({
      product_id: product_batch.product_id, cost_price: product_batch.cost_price, qty: product_batch.quantity_received,
      supplier_id: product_batch.supplier_id, received_at: product_batch.received_at,
    }).from(product_batch).where(inArray(product_batch.product_id, ids)).orderBy(desc(product_batch.received_at))

    const lastCost = new Map<string, number>()
    const lastSupplier = new Map<string, string>()
    const avgAcc = new Map<string, { cost: number; qty: number }>()
    const avgSince = Date.now() - 180 * 86_400_000
    for (const b of batchRows) {
      if (b.supplier_id && !lastSupplier.has(b.product_id)) lastSupplier.set(b.product_id, b.supplier_id)
      if (b.cost_price == null) continue
      const c = Number(b.cost_price)
      if (!lastCost.has(b.product_id)) lastCost.set(b.product_id, c)
      if (b.received_at.getTime() >= avgSince && b.qty > 0) {
        const a = avgAcc.get(b.product_id) ?? { cost: 0, qty: 0 }
        a.cost += c * b.qty; a.qty += b.qty
        avgAcc.set(b.product_id, a)
      }
    }
    const supplierFor = new Map(prodRows.map((p) => [p.id, p.supplier_id ?? lastSupplier.get(p.id) ?? null]))
    const supplierIds = [...new Set([...supplierFor.values()].filter((v): v is string => !!v))]
    const suppliers = supplierIds.length === 0 ? [] : await db.select({ id: supplier.id, name: supplier.name })
      .from(supplier).where(inArray(supplier.id, supplierIds))
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]))

    const suggestions: RestockSuggestion[] = candidates.map(({ s, sug, upp }) => {
      const pid = s.product_id!
      const avg = avgAcc.get(pid)
      // Batch/product cost is per BASE unit → ×units per pack for the PO line.
      const perUnit = costBasis === "avg" && avg && avg.qty > 0
        ? avg.cost / avg.qty
        : lastCost.get(pid) ?? (s.cost_price != null ? Number(s.cost_price) : null)
      const supplierId = supplierFor.get(pid) ?? null
      return {
        product_id: pid, name: s.name ?? "Item", strength: s.strength, base_unit: s.base_unit ?? "unit",
        pack_label: s.pack_label, units_per_pack: upp,
        stock_on_hand: s.stock_on_hand ?? 0, reorder_level: s.reorder_level ?? 10,
        sold: soldMap.get(pid) ?? 0, avg_daily: Math.round(sug.avgDaily * 100) / 100,
        on_order: onOrderMap.get(pid) ?? 0, suggested_packs: sug.packs, reason: sug.reason!,
        cost_per_pack: canSeeCost && perUnit != null ? Math.round(perUnit * upp * 100) / 100 : null,
        supplier_id: supplierId, supplier_name: supplierId ? supplierName.get(supplierId) ?? null : null,
      }
    })
    const rank: Record<SuggestReason, number> = { out_of_stock: 0, low_stock: 1, demand: 2 }
    suggestions.sort((a, b) => rank[a.reason] - rank[b.reason] || a.name.localeCompare(b.name))
    return NextResponse.json({ suggestions, windowDays, coverDays, costBasis })
  })
}
