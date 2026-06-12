import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { redis } from "@/lib/redis"

const CACHE_TTL = 3600 // 1 hour

interface LookupResponse {
  found: boolean
  product?: Record<string, unknown>
  suggestion?: {
    name: string
    manufacturer: string
    gtin: string
  }
}

async function fetchOpenFoodFacts(
  barcode: string,
): Promise<{ name: string; manufacturer: string } | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      status: number
      product?: { product_name?: string; brands?: string }
    }
    if (data.status !== 1 || !data.product?.product_name) return null
    return {
      name: data.product.product_name,
      manufacturer: data.product.brands ?? "",
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const barcode = request.nextUrl.searchParams.get("barcode")
  const branchId = request.nextUrl.searchParams.get("branch_id")

  if (!barcode) {
    return NextResponse.json({ error: "barcode is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const orgId = profile.organization_id
  const cacheKey = `product:${orgId}:${barcode}`

  // 1. Check Redis cache
  if (redis) {
    try {
      const cached = await redis.get<LookupResponse>(cacheKey)
      if (cached) {
        // Heal entries cached before product_id was emitted (the cart and the
        // sale schema key on product_id, not the raw products `id`).
        if (cached.product && !cached.product.product_id && cached.product.id) {
          cached.product.product_id = cached.product.id
        }
        return NextResponse.json(cached)
      }
    } catch {
      // Cache miss — continue
    }
  }

  // 2. Query Supabase — check gtin then barcode_raw
  const effectiveBranchId = branchId ?? profile.organization_id

  const { data: product } = await supabase
    .from("products")
    .select(
      `
      *,
      product_batches!inner (
        id, branch_id, quantity_remaining, expiry_date, batch_number
      )
    `,
    )
    .eq("organization_id", orgId)
    .or(`gtin.eq.${barcode},barcode_raw.eq.${barcode}`)
    .eq("is_active", true)
    .maybeSingle()

  if (product) {
    // Compute stock_on_hand from batches for the requested branch
    const batches = (
      product.product_batches as Array<{
        branch_id: string
        quantity_remaining: number
        expiry_date: string
        batch_number: string
      }>
    ).filter(
      (b) =>
        b.branch_id === effectiveBranchId &&
        b.quantity_remaining > 0,
    )

    const stockOnHand = batches.reduce((s, b) => s + b.quantity_remaining, 0)
    const earliestExpiry =
      batches.length > 0
        ? batches.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0]?.expiry_date ??
          null
        : null

    const productWithStock = {
      ...product,
      // The products table exposes `id`; the cart and sale schema expect
      // `product_id` (as the product_stock view provides). Without this,
      // scanned items reach the sale with no product_id and fail UUID validation.
      product_id: product.id,
      stock_on_hand: stockOnHand,
      earliest_expiry: earliestExpiry,
      batch_count: batches.length,
    }

    const response: LookupResponse = { found: true, product: productWithStock }

    if (redis) {
      try {
        await redis.set(cacheKey, response, { ex: CACHE_TTL })
      } catch {}
    }

    return NextResponse.json(response)
  }

  // 3. Not in system — try Open Food Facts
  const offSuggestion = await fetchOpenFoodFacts(barcode)
  if (offSuggestion) {
    const response: LookupResponse = {
      found: false,
      suggestion: { ...offSuggestion, gtin: barcode },
    }
    return NextResponse.json(response)
  }

  return NextResponse.json({ found: false })
}
