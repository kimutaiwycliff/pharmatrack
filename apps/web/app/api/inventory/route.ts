import { NextRequest, NextResponse } from "next/server"
import { and, eq, or, ilike, asc, sql } from "drizzle-orm"
import { withTenant, product_stock } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { canViewCost, omitCost } from "@/lib/auth/costVisibility"
import { searchThreshold } from "@/lib/search"

const EXPIRY_WARN_DAYS = 90
const num = (v: string | number | null) => (v == null ? null : Number(v))

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

interface Row {
  stock_on_hand: number | null; reorder_level: number | null
  earliest_expiry: string | null; is_controlled: boolean | null
}
function getStatus(p: Row): string[] {
  const badges: string[] = []
  const stock = p.stock_on_hand ?? 0
  if (stock === 0) badges.push("out_of_stock")
  else if (stock <= (p.reorder_level ?? 10)) badges.push("low_stock")
  else badges.push("ok")
  const days = daysUntil(p.earliest_expiry)
  if (days !== null && days <= EXPIRY_WARN_DAYS) badges.push("expiring")
  if (p.is_controlled) badges.push("controlled")
  return badges
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get("branch_id")
  const q = searchParams.get("q")?.trim() ?? ""
  const status = searchParams.get("status") ?? "all"
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))
  if (!branchId) return NextResponse.json({ error: "branch_id required" }, { status: 400 })

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const where = and(
    eq(product_stock.branch_id, branchId),
    eq(product_stock.is_active, true),
    q.length >= 2
      ? or(
          ilike(product_stock.name, `%${q}%`), ilike(product_stock.brand_name, `%${q}%`),
          ilike(product_stock.strength, `%${q}%`), ilike(product_stock.gtin, `%${q}%`),
          // Typo-tolerance via pg_trgm (e.g. "amoxicilin" → "Amoxicillin").
          sql`${product_stock.name} % ${q}`, sql`${product_stock.brand_name} % ${q}`,
        )
      : undefined,
  )

  const thr = searchThreshold(searchParams.get("threshold"))
  const all = await withTenant(ctx, async (db) => {
    if (q.length >= 2) await db.execute(sql`SET LOCAL pg_trgm.similarity_threshold = ${sql.raw(String(thr))}`)
    return db.select().from(product_stock).where(where).orderBy(asc(product_stock.name))
  })
  // PostgREST returned numerics as numbers; Drizzle/postgres.js returns strings — coerce.
  const withPrices = all.map((p) => ({
    ...p,
    selling_price: num(p.selling_price), cost_price: num(p.cost_price),
    max_discount_percent: num(p.max_discount_percent),
  }))
  const products = canViewCost(ctx.role) ? withPrices : withPrices.map(omitCost)

  let outOfStock = 0, lowStock = 0, expiring = 0, controlled = 0
  for (const p of products) {
    const s = getStatus(p)
    if (s.includes("out_of_stock")) outOfStock++
    if (s.includes("low_stock")) lowStock++
    if (s.includes("expiring")) expiring++
    if (s.includes("controlled")) controlled++
  }

  const filtered = status === "all" ? products : products.filter((p) => getStatus(p).includes(status))
  const total = filtered.length
  const offset = (page - 1) * limit
  const rows = filtered.slice(offset, offset + limit).map((p) => ({
    ...p, status_badges: getStatus(p), expiry_days: daysUntil(p.earliest_expiry),
  }))

  return NextResponse.json({ products: rows, total, page, limit, summary: { outOfStock, lowStock, expiring, controlled } })
}
