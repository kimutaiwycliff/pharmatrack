import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { ProductStock } from "@pharmatrack/types"

const EXPIRY_WARN_DAYS = 90

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

function getStatus(p: ProductStock): string[] {
  const badges: string[] = []
  const stock = p.stock_on_hand ?? 0

  if (stock === 0) {
    badges.push("out_of_stock")
  } else if (stock <= (p.reorder_level ?? 10)) {
    badges.push("low_stock")
  } else {
    badges.push("ok")
  }

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

  // Fetch all matching products (pharmacy scale: ≤1000 SKUs)
  let query = supabase
    .from("product_stock")
    .select("*")
    .eq("branch_id", branchId)
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (q.length >= 2) {
    query = query.or(
      `name.ilike.%${q}%,brand_name.ilike.%${q}%,strength.ilike.%${q}%,gtin.ilike.%${q}%`,
    )
  }

  const { data: all, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const products = all as ProductStock[]

  // Compute summary counts (across all, before status filter)
  let outOfStock = 0, lowStock = 0, expiring = 0, controlled = 0
  for (const p of products) {
    const s = getStatus(p)
    if (s.includes("out_of_stock")) outOfStock++
    if (s.includes("low_stock")) lowStock++
    if (s.includes("expiring")) expiring++
    if (s.includes("controlled")) controlled++
  }

  // Apply status filter
  const filtered = status === "all"
    ? products
    : products.filter((p) => getStatus(p).includes(status))

  const total = filtered.length
  const offset = (page - 1) * limit
  const paginated = filtered.slice(offset, offset + limit)

  // Attach computed badges and expiry days to each row
  const rows = paginated.map((p) => ({
    ...p,
    status_badges: getStatus(p),
    expiry_days: daysUntil(p.earliest_expiry),
  }))

  return NextResponse.json({
    products: rows,
    total,
    page,
    limit,
    summary: { outOfStock, lowStock, expiring, controlled },
  })
}
