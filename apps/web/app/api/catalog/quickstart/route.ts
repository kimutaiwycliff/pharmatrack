import { NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { dbAdmin, drug_catalog, product, withTenant } from "@pharmatrack/db"
import type { QsEntry } from "@pharmatrack/core"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"

// The shared catalogue changes only with migrations — build it once per server.
let cache: { at: number; entries: QsEntry[] } | null = null
async function catalogEntries(): Promise<QsEntry[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.entries
  const rows = await dbAdmin().select({
    id: drug_catalog.id, name: drug_catalog.name, brand: drug_catalog.brand_name, generic: drug_catalog.generic_name,
    strength: drug_catalog.strength, form: drug_catalog.dosage_form, manufacturer: drug_catalog.manufacturer,
    category: drug_catalog.category, subcategory: drug_catalog.subcategory, source: drug_catalog.source,
    ppb: drug_catalog.ppb_registration_no, rx: drug_catalog.requires_prescription, controlled: drug_catalog.is_controlled,
    price: drug_catalog.default_selling_price,
  }).from(drug_catalog)
  const entries = rows.map((r) => ({ ...r, source: r.source === "ppb" ? "ppb" as const : "curated" as const, price: r.price != null && Number(r.price) > 0 ? Number(r.price) : null }))
  cache = { at: Date.now(), entries }
  return entries
}

// GET /api/catalog/quickstart — everything the Quick Start picker shows: the
// curated everyday range + the PPB register (grouped client-side by
// packages/core quickStart.ts), and which of them this pharmacy already has
// (linked by catalog_id, or the same name + strength + form) so they show as
// "Already yours" and are never added twice. Owner / manager (catalog.seed).
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ctx.permissions.includes("catalog.seed")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const entries = await catalogEntries()
  const own = await withTenant(ctx, (db) =>
    db.select({ catalog_id: product.catalog_id, k: sql<string>`lower(${product.name}) || '|' || lower(coalesce(${product.strength}, '')) || '|' || lower(coalesce(${product.dosage_form}, ''))` })
      .from(product),
  )
  const ownIds = new Set(own.map((o) => o.catalog_id).filter(Boolean))
  const ownKeys = new Set(own.map((o) => o.k))
  const owned = entries
    .filter((e) => ownIds.has(e.id) || ownKeys.has(`${e.name.toLowerCase()}|${(e.strength ?? "").toLowerCase()}|${(e.form ?? "").toLowerCase()}`))
    .map((e) => e.id)
  const [qs] = await withTenant(ctx, (db) => db.select({ n: sql<number>`count(*)::int` }).from(product).where(eq(product.quick_start, true)))
  return NextResponse.json({ entries, owned, quick_start_products: qs?.n ?? 0 }, { headers: { "Cache-Control": "private, no-store" } })
}
