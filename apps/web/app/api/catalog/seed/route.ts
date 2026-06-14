import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Materialise the shared drug_catalog into an org's own products (and reverse
// it). Seeded rows are tagged with products.catalog_id so they can be removed
// cleanly and never double-seeded. Owner/manager only.

async function requireManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return { error: NextResponse.json({ error: "Profile not found" }, { status: 404 }) }
  if (!["owner", "manager"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase, user, orgId: profile.organization_id }
}

// Current state: how many catalog items exist and how many are already seeded.
export async function GET() {
  const ctx = await requireManager()
  if ("error" in ctx) return ctx.error
  const { supabase, orgId } = ctx

  const [{ count: catalogTotal }, { count: seeded }] = await Promise.all([
    supabase.from("drug_catalog").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).not("catalog_id", "is", null),
  ])
  return NextResponse.json({ catalogTotal: catalogTotal ?? 0, seeded: seeded ?? 0 })
}

// Seed: create one product per catalog item not already seeded for this org.
// Seeded products are inactive and unpriced (selling_price 0) so they can't be
// sold by accident — the owner sets prices and activates them afterwards.
export async function POST() {
  const ctx = await requireManager()
  if ("error" in ctx) return ctx.error
  const { supabase, user, orgId } = ctx

  const { data: catalog, error: catErr } = await supabase
    .from("drug_catalog")
    .select("id, name, brand_name, manufacturer, gtin, strength, dosage_form, base_unit, pack_label, units_per_pack, is_controlled, requires_prescription")
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 })

  const { data: existing } = await supabase
    .from("products")
    .select("catalog_id")
    .eq("organization_id", orgId)
    .not("catalog_id", "is", null)
  const seededIds = new Set((existing ?? []).map((p) => p.catalog_id))

  const toInsert = (catalog ?? [])
    .filter((c) => !seededIds.has(c.id))
    .map((c) => ({
      organization_id: orgId,
      created_by: user.id,
      catalog_id: c.id,
      name: c.name,
      brand_name: c.brand_name,
      manufacturer: c.manufacturer,
      gtin: c.gtin,
      strength: c.strength,
      dosage_form: c.dosage_form,
      base_unit: c.base_unit,
      pack_label: c.pack_label,
      units_per_pack: c.units_per_pack ?? 1,
      is_controlled: c.is_controlled,
      requires_prescription: c.requires_prescription,
      selling_price: 0,
      is_active: false,
    }))

  if (toInsert.length === 0) {
    return NextResponse.json({ seeded: 0, alreadyPresent: seededIds.size })
  }

  const { error: insErr, count } = await supabase
    .from("products")
    .insert(toInsert, { count: "exact" })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ seeded: count ?? toInsert.length, alreadyPresent: seededIds.size })
}

// Unseed: remove ONLY seeded products that are untouched (no batches, no sales).
// Anything that has been received or sold is kept so we never orphan history.
export async function DELETE() {
  const ctx = await requireManager()
  if ("error" in ctx) return ctx.error
  const { supabase, orgId } = ctx

  const { data: seeded } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", orgId)
    .not("catalog_id", "is", null)
  const ids = (seeded ?? []).map((p) => p.id)
  if (ids.length === 0) return NextResponse.json({ removed: 0, kept: 0 })

  // Which seeded products have stock batches or sale history?
  const [{ data: batches }, { data: sold }] = await Promise.all([
    supabase.from("product_batches").select("product_id").in("product_id", ids),
    supabase.from("sale_items").select("product_id").in("product_id", ids),
  ])
  const touched = new Set<string>([
    ...(batches ?? []).map((b) => b.product_id),
    ...(sold ?? []).map((s) => s.product_id),
  ])
  const removable = ids.filter((id) => !touched.has(id))

  if (removable.length > 0) {
    const { error } = await supabase.from("products").delete().in("id", removable)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ removed: removable.length, kept: ids.length - removable.length })
}
