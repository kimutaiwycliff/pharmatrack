import { NextRequest, NextResponse } from "next/server"
import { and, asc, desc, eq, or, ilike, sql } from "drizzle-orm"
import { withTenant, product_stock } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { searchThreshold } from "@/lib/search"

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

  const searching = !all && q.length >= 2
  // Match on substring (ILIKE — partials/prefixes) OR trigram similarity (the `%`
  // operator — typos like "paracetmol"→"Paracetamol"). Both use the pg_trgm GIN
  // indexes. Relevance = best similarity across name/brand/generic, closest first.
  const relevance = sql<number>`greatest(similarity(${product_stock.name}, ${q}), similarity(coalesce(${product_stock.brand_name}, ''), ${q}), similarity(coalesce(${product_stock.generic_name}, ''), ${q}))`
  // Related-products expansion: pull in every variant that shares the molecule of
  // any direct match — so a brand search (e.g. "Voltaren") returns the generic and
  // all strengths (Diclofenac 50mg/100mg/cream/inj …), not just the brand row.
  const directMatch = or(
    ilike(product_stock.name, `%${q}%`),
    ilike(product_stock.brand_name, `%${q}%`),
    ilike(product_stock.strength, `%${q}%`),
    ilike(product_stock.generic_name, `%${q}%`),
    sql`${product_stock.name} % ${q}`,
    sql`${product_stock.brand_name} % ${q}`,
    sql`${product_stock.generic_name} % ${q}`,
  )
  const where = and(
    eq(product_stock.branch_id, branchId),
    eq(product_stock.is_active, true),
    searching
      ? or(
          directMatch,
          sql`${product_stock.generic_name} IN (
            SELECT ps.generic_name FROM product_stock ps
            WHERE ps.branch_id = ${branchId} AND ps.is_active AND ps.generic_name IS NOT NULL
              AND (ps.name ILIKE ${`%${q}%`} OR ps.brand_name ILIKE ${`%${q}%`}
                   OR ps.name % ${q} OR ps.brand_name % ${q} OR ps.generic_name ILIKE ${`%${q}%`})
          )`,
        )
      : undefined,
  )

  const thr = searchThreshold(searchParams.get("threshold"))
  const rows = await withTenant(ctx, async (db) => {
    // Tune the trigram `%` fuzziness for this query (SET LOCAL = transaction-scoped).
    if (searching) await db.execute(sql`SET LOCAL pg_trgm.similarity_threshold = ${sql.raw(String(thr))}`)
    return db.select().from(product_stock).where(where)
      // Best match first, then cluster variants by molecule + strength.
      .orderBy(
        searching ? desc(relevance) : asc(product_stock.name),
        ...(searching ? [asc(product_stock.generic_name), asc(product_stock.strength)] : []),
      )
      .limit(all ? 5000 : 30)
  })

  // PostgREST returned numerics as numbers; Drizzle/postgres.js returns strings.
  const products = rows.map((p) => ({
    ...p, selling_price: num(p.selling_price), cost_price: num(p.cost_price), max_discount_percent: num(p.max_discount_percent),
  }))

  return NextResponse.json({ products })
}
