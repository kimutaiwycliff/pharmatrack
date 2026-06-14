import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Shared, cross-tenant drug catalog used to speed up product onboarding.
// Read-only: returns reference rows the user can pick from to autofill a new
// product. RLS allows any authenticated user to read it.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let query = supabase
    .from("drug_catalog")
    .select("id, name, brand_name, manufacturer, gtin, strength, dosage_form, base_unit, pack_label, units_per_pack, is_controlled, requires_prescription")
    .order("name", { ascending: true })
    .limit(limit)

  if (q.length >= 1) {
    // Match by molecule/brand/strength, or an exact-ish barcode.
    query = query.or(
      `name.ilike.%${q}%,brand_name.ilike.%${q}%,strength.ilike.%${q}%,gtin.ilike.%${q}%`,
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [] })
}
