import { NextRequest, NextResponse } from "next/server"
import { asc, desc, eq, or, ilike, sql } from "drizzle-orm"
import { dbAdmin, drug_catalog } from "@pharmatrack/db"
import { getSession } from "@/lib/auth/helpers"
import { catalogSearchTerm } from "@/lib/search"

const num = (v: string | number | null) => (v == null ? null : Number(v))

// Shared drug catalogue search (global reference) for product onboarding.
// Read-only; any signed-in user may search it. Covers the curated retail list
// (priced) and the Pharmacy and Poisons Board register (source = 'ppb').
// Typo-tolerant via pg_trgm (the `%` operator, default threshold 0.3).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const raw = (searchParams.get("q") ?? "").trim().slice(0, 100)
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20))

  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = dbAdmin()
  const cols = {
    id: drug_catalog.id,
    name: drug_catalog.name,
    brand_name: drug_catalog.brand_name,
    generic_name: drug_catalog.generic_name,
    manufacturer: drug_catalog.manufacturer,
    gtin: drug_catalog.gtin,
    strength: drug_catalog.strength,
    dosage_form: drug_catalog.dosage_form,
    base_unit: drug_catalog.base_unit,
    category: drug_catalog.category,
    is_controlled: drug_catalog.is_controlled,
    requires_prescription: drug_catalog.requires_prescription,
    pack_label: drug_catalog.default_pack_label,
    units_per_pack: drug_catalog.default_units_per_pack,
    // Per base unit, like product.selling_price. Curated rows only.
    reference_price: drug_catalog.default_selling_price,
    source: drug_catalog.source,
    ppb_registration_no: drug_catalog.ppb_registration_no,
  }

  if (raw.length < 1) {
    const items = await db.select(cols).from(drug_catalog)
      .orderBy(asc(drug_catalog.source), asc(drug_catalog.name)).limit(limit)
    return NextResponse.json({ items: items.map((i) => ({ ...i, reference_price: num(i.reference_price) })) })
  }

  const q = catalogSearchTerm(raw)
  const like = `%${q}%`
  const prefix = `${q}%`
  // Best match first: name/brand/molecule starting with the query, then trigram
  // closeness; the curated (priced) row wins a tie with a register row.
  const relevance = sql<number>`(
    CASE WHEN ${drug_catalog.name} ILIKE ${prefix} OR ${drug_catalog.brand_name} ILIKE ${prefix}
           OR ${drug_catalog.generic_name} ILIKE ${prefix} THEN 1 ELSE 0 END
    + greatest(similarity(${drug_catalog.name}, ${q}), similarity(coalesce(${drug_catalog.brand_name}, ''), ${q}),
               similarity(coalesce(${drug_catalog.generic_name}, ''), ${q}), word_similarity(${q}, ${drug_catalog.name}))
    + CASE WHEN ${drug_catalog.source} = 'curated' THEN 0.15 ELSE 0 END
  )`

  const items = await db.select(cols).from(drug_catalog).where(or(
    ilike(drug_catalog.name, like),
    ilike(drug_catalog.brand_name, like),
    ilike(drug_catalog.generic_name, like),
    eq(drug_catalog.gtin, raw),
    eq(drug_catalog.ppb_registration_no, raw),
    sql`${drug_catalog.name} % ${q}`,
    sql`${drug_catalog.brand_name} % ${q}`,
    sql`${drug_catalog.generic_name} % ${q}`,
  )).orderBy(desc(relevance), asc(drug_catalog.name), asc(drug_catalog.strength)).limit(limit)

  return NextResponse.json({ items: items.map((i) => ({ ...i, reference_price: num(i.reference_price) })) })
}
