import { NextRequest, NextResponse } from "next/server"
import { or, ilike, asc } from "drizzle-orm"
import { dbAdmin, drug_catalog } from "@pharmatrack/db"
import { getSession } from "@/lib/auth/helpers"

// Shared drug catalogue search (global reference) for product onboarding.
// Read-only; any signed-in user may search it.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))

  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = dbAdmin()
  const cols = {
    id: drug_catalog.id,
    name: drug_catalog.name,
    brand_name: drug_catalog.brand_name,
    manufacturer: drug_catalog.manufacturer,
    gtin: drug_catalog.gtin,
    strength: drug_catalog.strength,
    dosage_form: drug_catalog.dosage_form,
    base_unit: drug_catalog.base_unit,
    is_controlled: drug_catalog.is_controlled,
    requires_prescription: drug_catalog.requires_prescription,
  }

  const items = q.length >= 1
    ? await db.select(cols).from(drug_catalog).where(or(
        ilike(drug_catalog.name, `%${q}%`),
        ilike(drug_catalog.brand_name, `%${q}%`),
        ilike(drug_catalog.strength, `%${q}%`),
        ilike(drug_catalog.gtin, `%${q}%`),
      )).orderBy(asc(drug_catalog.name)).limit(limit)
    : await db.select(cols).from(drug_catalog).orderBy(asc(drug_catalog.name)).limit(limit)

  return NextResponse.json({ items })
}
