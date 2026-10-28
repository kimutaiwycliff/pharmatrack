import { NextRequest, NextResponse } from "next/server"
import { asc, eq, ilike, inArray, or } from "drizzle-orm"
import { withTenant, dbAdmin, category, drug_catalog, product } from "@pharmatrack/db"
import { taxonomyKey } from "@pharmatrack/core"
import { stockTakeContext } from "@/lib/stockTake/server"

// Stock take (ADR-020): find one drug and count it straight away. Returns the
// pharmacy's products (name, generic name or barcode) with the shelf each one
// sits on, plus — for people who can set up — catalogue medicines it doesn't
// have yet, with their default shelf. The page then starts (or resumes) a
// count of that shelf with the drug open.

export interface StockTakeSearchResult {
  key: string
  name: string
  detail: string
  source: "product" | "catalog"
  shelf: { name: string; category_id: string | null; taxonomy_key: string | null } | null
}

export async function GET(request: NextRequest) {
  const r = await stockTakeContext()
  if ("error" in r) return r.error
  const { ctx } = r
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 60) ?? ""
  if (q.length < 2) return NextResponse.json({ results: [] })
  const canSetup = ctx.permissions.includes("products.create") && ctx.permissions.includes("stock.receive")
  const detail = (...parts: Array<string | null>) => parts.filter(Boolean).join(" · ")

  const results = await withTenant(ctx, async (db) => {
    const own = await db.select({
      id: product.id, name: product.name, strength: product.strength, dosage_form: product.dosage_form, pack_label: product.pack_label,
      catalog_id: product.catalog_id, category_id: product.category_id, category_name: category.name,
    }).from(product).leftJoin(category, eq(category.id, product.category_id))
      .where(or(ilike(product.name, `%${q}%`), ilike(product.generic_name, `%${q}%`), eq(product.gtin, q), eq(product.barcode_raw, q)))
      .orderBy(asc(product.name)).limit(15)

    // An uncategorised product counts on its catalogue entry's default shelf.
    const catalogOf = new Map<string, { category: string | null; subcategory: string | null }>()
    const needCatalog = own.filter((p) => !p.category_id && p.catalog_id).map((p) => p.catalog_id!)
    if (needCatalog.length) {
      const rows = await dbAdmin().select({ id: drug_catalog.id, category: drug_catalog.category, subcategory: drug_catalog.subcategory })
        .from(drug_catalog).where(inArray(drug_catalog.id, needCatalog))
      for (const c of rows) catalogOf.set(c.id, c)
    }
    const out: StockTakeSearchResult[] = own.map((p) => {
      const c = p.catalog_id ? catalogOf.get(p.catalog_id) : undefined
      const shelf = p.category_id
        ? { name: p.category_name ?? "Shelf", category_id: p.category_id, taxonomy_key: null }
        : c?.category ? { name: c.subcategory ?? c.category, category_id: null, taxonomy_key: taxonomyKey(c.category, c.subcategory) } : null
      return { key: `p:${p.id}`, name: p.name, detail: detail(p.strength, p.dosage_form, p.pack_label), source: "product" as const, shelf }
    })

    if (canSetup) {
      const mine = new Set((await db.select({ catalog_id: product.catalog_id }).from(product)).map((m) => m.catalog_id).filter(Boolean))
      const rows = await dbAdmin().select().from(drug_catalog)
        .where(or(ilike(drug_catalog.name, `%${q}%`), ilike(drug_catalog.generic_name, `%${q}%`)))
        .orderBy(asc(drug_catalog.name)).limit(40)
      // Names that match first ("Amoxicillin"), then generic-name matches ("Acinet").
      const ql = q.toLowerCase()
      const rank = (n: string) => (n.toLowerCase().startsWith(ql) ? 0 : n.toLowerCase().includes(ql) ? 1 : 2)
      rows.sort((a, b) => rank(a.name) - rank(b.name))
      for (const c of rows.filter((x) => !mine.has(x.id) && x.category).slice(0, 10)) {
        out.push({
          key: `k:${c.id}`, name: c.name, detail: detail(c.strength, c.dosage_form, c.default_pack_label), source: "catalog",
          shelf: { name: c.subcategory ?? c.category!, category_id: null, taxonomy_key: taxonomyKey(c.category!, c.subcategory) },
        })
      }
    }
    return out
  })
  return NextResponse.json({ results })
}
