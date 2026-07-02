import { NextRequest, NextResponse } from "next/server"
import { and, or, eq, gt, asc } from "drizzle-orm"
import { withTenant, product, product_batch } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { canViewCostInContext, omitCost } from "@/lib/auth/costVisibility"
import { redis } from "@/lib/redis"

const CACHE_TTL = 3600

interface LookupResponse {
  found: boolean
  product?: Record<string, unknown>
  suggestion?: { name: string; manufacturer: string; gtin: string }
}

// The Redis cache is shared across every role at this branch/barcode, so it
// always stores the FULL response — filter cost only at the response edge,
// never before caching, or a cashier's lookup would poison the cache for the
// next owner who scans the same barcode.
function filterLookup(resp: LookupResponse, role: Role, context: string | null): LookupResponse {
  if (canViewCostInContext(role, context) || !resp.product) return resp
  return { ...resp, product: omitCost(resp.product) }
}

async function fetchOpenFoodFacts(barcode: string): Promise<{ name: string; manufacturer: string } | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const data = (await res.json()) as { status: number; product?: { product_name?: string; brands?: string } }
    if (data.status !== 1 || !data.product?.product_name) return null
    return { name: data.product.product_name, manufacturer: data.product.brands ?? "" }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const barcode = request.nextUrl.searchParams.get("barcode")
  const branchId = request.nextUrl.searchParams.get("branch_id")
  if (!barcode) return NextResponse.json({ error: "barcode is required" }, { status: 400 })

  const context = request.nextUrl.searchParams.get("context")
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const effectiveBranchId = branchId ?? ctx.branchId
  const cacheKey = `product:${ctx.organizationId}:${effectiveBranchId ?? "-"}:${barcode}`

  if (redis) {
    try {
      const cached = await redis.get<LookupResponse>(cacheKey)
      if (cached) return NextResponse.json(filterLookup(cached, ctx.role, context))
    } catch { /* miss */ }
  }

  const productWithStock = await withTenant(ctx, async (db) => {
    const [p] = await db.select().from(product)
      .where(and(eq(product.is_active, true), or(eq(product.gtin, barcode), eq(product.barcode_raw, barcode))))
      .limit(1)
    if (!p) return null
    const batches = effectiveBranchId
      ? await db.select().from(product_batch)
          .where(and(eq(product_batch.product_id, p.id), eq(product_batch.branch_id, effectiveBranchId), gt(product_batch.quantity_remaining, 0)))
          .orderBy(asc(product_batch.expiry_date))
      : []
    const stock = batches.reduce((s, b) => s + b.quantity_remaining, 0)
    return {
      ...p,
      product_id: p.id, // cart/sale schema keys on product_id
      stock_on_hand: stock,
      earliest_expiry: batches[0]?.expiry_date ?? null,
      batch_count: batches.length,
    }
  })

  if (productWithStock) {
    const response: LookupResponse = { found: true, product: productWithStock }
    if (redis) { try { await redis.set(cacheKey, response, { ex: CACHE_TTL }) } catch {} }
    return NextResponse.json(filterLookup(response, ctx.role, context))
  }

  const off = await fetchOpenFoodFacts(barcode)
  if (off) return NextResponse.json({ found: false, suggestion: { ...off, gtin: barcode } } satisfies LookupResponse)
  return NextResponse.json({ found: false })
}
