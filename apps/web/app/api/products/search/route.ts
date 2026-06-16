import { NextRequest, NextResponse } from "next/server"
import { and, asc, eq, or, ilike } from "drizzle-orm"
import { withTenant, product_stock } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"

const num = (v: string | number | null) => (v == null ? null : Number(v))

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const branchId = searchParams.get("branch_id")
  // `all=1` returns the whole branch catalogue so the POS can warm its offline
  // cache in one shot (bounded so a huge catalogue can't blow up the response).
  const all = searchParams.get("all") === "1"
  if (!branchId) return NextResponse.json({ error: "branch_id required" }, { status: 400 })

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const where = and(
    eq(product_stock.branch_id, branchId),
    eq(product_stock.is_active, true),
    !all && q.length >= 2
      ? or(ilike(product_stock.name, `%${q}%`), ilike(product_stock.brand_name, `%${q}%`), ilike(product_stock.strength, `%${q}%`))
      : undefined,
  )

  const rows = await withTenant(ctx.organizationId, (db) =>
    db.select().from(product_stock).where(where).orderBy(asc(product_stock.name)).limit(all ? 5000 : 20),
  )

  // PostgREST returned numerics as numbers; Drizzle/postgres.js returns strings.
  const products = rows.map((p) => ({
    ...p, selling_price: num(p.selling_price), cost_price: num(p.cost_price), max_discount_percent: num(p.max_discount_percent),
  }))

  return NextResponse.json({ products })
}
