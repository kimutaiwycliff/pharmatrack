import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const branchId = searchParams.get("branch_id")

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

  let query = supabase
    .from("product_stock")
    .select("*")
    .eq("branch_id", branchId)
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(20)

  if (q.length >= 2) {
    query = query.or(`name.ilike.%${q}%,brand_name.ilike.%${q}%,strength.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ products: data ?? [] })
}
