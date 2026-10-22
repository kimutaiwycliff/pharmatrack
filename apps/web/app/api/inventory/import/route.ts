import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, ilike } from "drizzle-orm"
import {
  dbAdmin, drug_catalog, withTenant, branch as branchTable, product, product_batch, product_pack_size,
  category as categoryTable, supplier as supplierTable,
} from "@pharmatrack/db"
import {
  DEFAULT_TAXONOMY, PRESCRIPTION_DEPARTMENTS, brandMolecule, buildCatalogIndex, findTaxonomyEntry, matchCatalog, suggestCategory, taxonomyKey,
  type CatalogEntry, type CatalogIndex, type CatalogMatch,
} from "@pharmatrack/core"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { deriveGenericName } from "@/lib/generic-name"
import { resolveDefaultCategory } from "@/lib/catalog/defaultCategory"

const MAX_ROWS = 2000

const truthy = new Set(["true", "yes", "y", "1", "controlled", "rx", "prescription", "pom"])
const falsy = new Set(["false", "no", "n", "0", "otc"])
/** yes/no cell → boolean; undefined when blank (so the catalogue can fill it). */
function toBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v
  const s = String(v ?? "").trim().toLowerCase()
  if (truthy.has(s)) return true
  if (falsy.has(s)) return false
  return undefined
}

const rowSchema = z
  .object({
    name: z.string().trim().min(1, "name is required"),
    generic_name: z.string().trim().optional(),
    brand_name: z.string().trim().optional(),
    manufacturer: z.string().trim().optional(),
    gtin: z.string().trim().optional(),
    // The pharmacy's previous item code / any other barcode on the pack.
    barcode_raw: z.string().trim().max(64).optional(),
    strength: z.string().trim().optional(),
    dosage_form: z.string().trim().optional(),
    base_unit: z.string().trim().optional(),
    category: z.string().trim().optional(),
    subcategory: z.string().trim().optional(),
    supplier: z.string().trim().max(120).optional(),
    pack_label: z.string().trim().optional(),
    units_per_pack: z.coerce.number().int().positive().optional(),
    cost_price: z.coerce.number().nonnegative().optional(),
    selling_price: z.coerce.number().positive("selling_price must be greater than 0"),
    // A full pack sold at its own price (not units × unit price) → a pack size.
    pack_selling_price: z.coerce.number().positive().optional(),
    reorder_level: z.coerce.number().int().nonnegative().optional(),
    is_controlled: z.unknown().optional(),
    requires_prescription: z.unknown().optional(),
    opening_qty: z.coerce.number().int().nonnegative().optional(),
    batch_number: z.string().trim().optional(),
    expiry_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "expiry_date must be YYYY-MM-DD").optional(),
  })
  .transform((r) => {
    const clean = <T,>(v: T) => (typeof v === "string" && v.trim() === "" ? undefined : v)
    return {
      ...r,
      generic_name: clean(r.generic_name), brand_name: clean(r.brand_name), manufacturer: clean(r.manufacturer), gtin: clean(r.gtin),
      barcode_raw: clean(r.barcode_raw), strength: clean(r.strength), dosage_form: clean(r.dosage_form), base_unit: clean(r.base_unit),
      category: clean(r.category), subcategory: clean(r.subcategory), supplier: clean(r.supplier),
      pack_label: clean(r.pack_label), batch_number: clean(r.batch_number), expiry_date: clean(r.expiry_date),
    }
  })

const payloadSchema = z.object({
  branch_id: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_ROWS),
  // Preview only: classify every row, write nothing.
  dry_run: z.boolean().optional(),
  // A row that's already one of your products: add its opening stock to it
  // (default), or skip it. Never creates a second copy.
  on_duplicate: z.enum(["add_stock", "skip"]).optional(),
  // Fill blank cells from the shared catalogue (PPB register + curated list).
  use_catalog: z.boolean().optional(),
  // Row numbers of the whole file when it's sent in chunks (reports stay per-file).
  row_offset: z.number().int().nonnegative().optional(),
})

const key = (name: string, strength?: string | null, form?: string | null) =>
  `${name.trim().toLowerCase()}|${(strength ?? "").trim().toLowerCase()}|${(form ?? "").trim().toLowerCase()}`

// The shared catalogue changes only with migrations — index it once per server.
let catalogCache: { at: number; index: CatalogIndex } | null = null
async function catalogIndex(): Promise<CatalogIndex> {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60_000) return catalogCache.index
  const rows = await dbAdmin().select({
    id: drug_catalog.id, name: drug_catalog.name, brand_name: drug_catalog.brand_name, generic_name: drug_catalog.generic_name,
    strength: drug_catalog.strength, dosage_form: drug_catalog.dosage_form, base_unit: drug_catalog.base_unit,
    manufacturer: drug_catalog.manufacturer, is_controlled: drug_catalog.is_controlled, requires_prescription: drug_catalog.requires_prescription,
    category: drug_catalog.category, subcategory: drug_catalog.subcategory, source: drug_catalog.source,
    ppb_registration_no: drug_catalog.ppb_registration_no,
  }).from(drug_catalog)
  const index = buildCatalogIndex(rows as CatalogEntry[])
  catalogCache = { at: Date.now(), index }
  return index
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A sheet's "Category / Subcategory" → a default category key when it names one. */
function defaultKeyFor(cat?: string, sub?: string): string | null {
  if (!cat || !sub) return null
  const c = Object.keys(DEFAULT_TAXONOMY).find((x) => same(x, cat))
  if (!c) return null
  const s = DEFAULT_TAXONOMY[c as keyof typeof DEFAULT_TAXONOMY].find((x) => same(x, sub))
  return s ? taxonomyKey(c, s) : null
}

type Category =
  | { key: string; label: string; source: "sheet" | "catalogue" | "suggested" }
  | { names: [string, string | undefined]; label: string; source: "sheet" }
  | null

// Bulk import (web Products / Inventory → Import from Excel, Android importer).
// Every row is checked against your products first — same barcode or item
// code, or same name + strength + form (POST /api/products' rule) — and
// against earlier rows of the same file, so re-importing a sheet never doubles
// the catalogue. Blank cells are filled from the shared catalogue when the row
// is recognised there (brand + strength = exact; brand only = the molecule and
// flags; molecule only = the flags). Categories: the sheet's own, else the
// catalogue's, else a confident suggestion — defaults are created on first use.
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!ctx.permissions.includes("stock.receive")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = payloadSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const dryRun = parsed.data.dry_run === true
  const onDuplicate = parsed.data.on_duplicate ?? "add_stock"
  const useCatalog = parsed.data.use_catalog !== false
  const offset = parsed.data.row_offset ?? 0

  // Validate the target branch belongs to this org (opening stock needs it).
  let branchId: string | null = null
  if (parsed.data.branch_id) {
    const [b] = await withTenant(ctx, (db) =>
      db.select({ id: branchTable.id }).from(branchTable).where(and(eq(branchTable.id, parsed.data.branch_id!), eq(branchTable.organization_id, ctx.organizationId))).limit(1),
    )
    if (!b) return NextResponse.json({ error: "Branch not found in your organization" }, { status: 400 })
    branchId = b.id
  }

  // Validate every row up front.
  const rows = parsed.data.rows.map((raw, i) => {
    const r = rowSchema.safeParse(raw)
    return r.success
      ? { row: offset + i + 1, ok: true as const, r: r.data }
      : { row: offset + i + 1, ok: false as const, name: String((raw as Record<string, unknown>).name ?? "—"), error: r.error.issues[0]?.message ?? "Invalid row" }
  })
  const valid = rows.flatMap((x) => (x.ok ? [x] : []))

  // Your existing products, to never create a second copy.
  const existing = await withTenant(ctx, (db) =>
    db.select({ id: product.id, name: product.name, strength: product.strength, dosage_form: product.dosage_form, gtin: product.gtin, barcode_raw: product.barcode_raw })
      .from(product),
  )
  const byKey = new Map(existing.map((p) => [key(p.name, p.strength, p.dosage_form), p]))
  const byCode = new Map<string, (typeof existing)[number]>()
  for (const p of existing) {
    if (p.gtin) byCode.set(p.gtin, p)
    if (p.barcode_raw) byCode.set(p.barcode_raw, p)
  }

  const index = useCatalog ? await catalogIndex() : null

  type Plan = {
    row: number; r: (typeof valid)[number]["r"]; status: "new" | "duplicate"
    /** Existing product, or the earlier row of this file it repeats. */
    matchId?: string; matchRow?: number; matchName?: string
    catalog: CatalogMatch | null
    fill: { generic_name: string | null; strength?: string; dosage_form?: string; base_unit?: string; manufacturer?: string; is_controlled: boolean; requires_prescription: boolean }
    filled: string[]
    category: Category
  }
  const plans: Plan[] = []
  const firstRowByKey = new Map<string, number>()
  const firstRowByCode = new Map<string, number>()
  for (const x of valid) {
    const r = x.r
    const m = index ? matchCatalog(index, { name: r.name, strength: r.strength, dosageForm: r.dosage_form }) : null
    const e = m?.entry
    const exact = m?.confidence === "exact"
    const filled: string[] = []
    const take = <T,>(given: T | undefined, fromCatalog: T | null | undefined, label: string): T | undefined => {
      if (given !== undefined) return given
      if (fromCatalog != null && fromCatalog !== "") {
        if (fromCatalog !== false) filled.push(label) // a flag is only worth mentioning when it's on
        return fromCatalog
      }
      return undefined
    }
    const fill = {
      generic_name: take(r.generic_name, e?.generic_name, "generic") ?? brandMolecule(r.name) ?? deriveGenericName(r.name),
      strength: take(r.strength, exact ? e?.strength : null, "strength"),
      dosage_form: take(r.dosage_form, exact ? e?.dosage_form : null, "form"),
      base_unit: take(r.base_unit, exact ? e?.base_unit : null, "unit"),
      manufacturer: take(r.manufacturer, m && m.confidence !== "generic" ? e?.manufacturer : null, "manufacturer"),
      is_controlled: take(toBool(r.is_controlled), e?.is_controlled, "controlled flag") ?? false,
      requires_prescription: take(toBool(r.requires_prescription), e?.requires_prescription, "Rx flag") ?? false,
    }

    // Category: the sheet's, else the catalogue's (exact matches), else a confident suggestion.
    let category: Category = null
    const sheetKey = defaultKeyFor(r.category, r.subcategory)
    if (sheetKey) category = { key: sheetKey, label: `${r.subcategory} · ${r.category}`, source: "sheet" }
    else if (r.category) category = { names: [r.category, r.subcategory], label: r.subcategory ? `${r.subcategory} · ${r.category}` : r.category, source: "sheet" }
    else if (exact && e?.category && e.subcategory && findTaxonomyEntry(taxonomyKey(e.category, e.subcategory))) {
      category = { key: taxonomyKey(e.category, e.subcategory), label: `${e.subcategory} · ${e.category}`, source: "catalogue" }
    } else {
      const s = suggestCategory({ name: r.name, generic: fill.generic_name, dosageForm: fill.dosage_form })
      if (s?.confidence === "likely") category = { key: taxonomyKey(s.category, s.subcategory), label: `${s.subcategory} · ${s.category}`, source: "suggested" }
    }

    // Nothing said whether it's prescription-only: medicines in POM classes
    // (antibiotics, BP, diabetes, mental health…) default to Rx — the safe side.
    const department = category && "key" in category ? findTaxonomyEntry(category.key)?.category : undefined
    if (toBool(r.requires_prescription) === undefined && e?.requires_prescription == null && department && PRESCRIPTION_DEPARTMENTS.includes(department)) {
      fill.requires_prescription = true
      filled.push("Rx flag (by category)")
    }

    const k = key(r.name, fill.strength, fill.dosage_form)
    const dupe = (r.gtin ? byCode.get(r.gtin) : undefined) ?? (r.barcode_raw ? byCode.get(r.barcode_raw) : undefined)
      ?? byKey.get(k) ?? byKey.get(key(r.name, r.strength, r.dosage_form))
    const base = { row: x.row, r, catalog: m, fill, filled, category }
    if (dupe) {
      plans.push({ ...base, status: "duplicate", matchId: dupe.id, matchName: [dupe.name, dupe.strength].filter(Boolean).join(" ") })
    } else if (firstRowByKey.has(k) || (r.gtin && firstRowByCode.has(r.gtin)) || (r.barcode_raw && firstRowByCode.has(r.barcode_raw))) {
      const first = firstRowByKey.get(k) ?? firstRowByCode.get(r.gtin ?? "") ?? firstRowByCode.get(r.barcode_raw ?? "")!
      plans.push({ ...base, status: "duplicate", matchRow: first, matchName: `row ${first} of this file` })
    } else {
      firstRowByKey.set(k, x.row)
      if (r.gtin) firstRowByCode.set(r.gtin, x.row)
      if (r.barcode_raw) firstRowByCode.set(r.barcode_raw, x.row)
      plans.push({ ...base, status: "new" })
    }
  }

  if (dryRun) {
    const report = [
      ...rows.flatMap((x) => (x.ok ? [] : [{ row: x.row, name: x.name, status: "invalid" as const, error: x.error }])),
      ...plans.map((p) => ({
        row: p.row, name: p.r.name, status: p.status, match: p.matchName,
        filled: p.filled.length ? p.filled : undefined,
        catalog: p.catalog ? {
          confidence: p.catalog.confidence,
          label: [p.catalog.entry.name, p.catalog.entry.strength, p.catalog.entry.dosage_form].filter(Boolean).join(" "),
          ppb: p.catalog.entry.ppb_registration_no,
        } : undefined,
        category: p.category ? { label: p.category.label, source: p.category.source } : undefined,
      })),
    ].sort((a, b) => a.row - b.row)
    return NextResponse.json({
      dry_run: true,
      total: rows.length,
      new: plans.filter((p) => p.status === "new").length,
      duplicates: plans.filter((p) => p.status === "duplicate").length,
      invalid: rows.length - valid.length,
      filled_from_catalog: plans.filter((p) => p.filled.length > 0).length,
      catalog_matched: plans.filter((p) => p.catalog).length,
      categorised: plans.filter((p) => p.category).length,
      rows: report,
    })
  }

  // Category resolver — default categories by key (created on first use,
  // linked by default_key), the sheet's own names otherwise. Cached per request.
  const existingCats = await withTenant(ctx, (db) =>
    db.select({ id: categoryTable.id, name: categoryTable.name, parent_id: categoryTable.parent_id }).from(categoryTable),
  )
  const parentByName = new Map(existingCats.filter((c) => !c.parent_id).map((c) => [c.name.toLowerCase(), c.id]))
  const childKey = (pid: string, name: string) => `${pid}::${name.toLowerCase()}`
  const childByKey = new Map(existingCats.filter((c) => c.parent_id).map((c) => [childKey(c.parent_id!, c.name), c.id]))
  const byDefaultKey = new Map<string, string | null>()

  async function resolveCategoryId(c: Category): Promise<string | null> {
    if (!c) return null
    if ("key" in c) {
      if (!byDefaultKey.has(c.key)) byDefaultKey.set(c.key, await withTenant(ctx!.organizationId, (db) => resolveDefaultCategory(db, ctx!.organizationId, c.key)))
      return byDefaultKey.get(c.key) ?? null
    }
    const [catName, subName] = c.names
    let pid = parentByName.get(catName.toLowerCase())
    if (!pid) {
      const [ins] = await withTenant(ctx!.organizationId, (db) =>
        db.insert(categoryTable).values({ organization_id: ctx!.organizationId, name: catName }).returning({ id: categoryTable.id }))
      pid = ins!.id; parentByName.set(catName.toLowerCase(), pid)
    }
    if (!subName) return pid
    const ck = childKey(pid, subName)
    let cid = childByKey.get(ck)
    if (!cid) {
      const [ins] = await withTenant(ctx!.organizationId, (db) =>
        db.insert(categoryTable).values({ organization_id: ctx!.organizationId, name: subName, parent_id: pid! }).returning({ id: categoryTable.id }))
      cid = ins!.id; childByKey.set(ck, cid)
    }
    return cid
  }

  // Suppliers by name — reused, or created once.
  const supplierIds = new Map<string, string>()
  async function resolveSupplierId(name?: string): Promise<string | null> {
    if (!name) return null
    const k = name.toLowerCase()
    const known = supplierIds.get(k)
    if (known) return known
    const id = await withTenant(ctx!, async (db) => {
      const [found] = await db.select({ id: supplierTable.id }).from(supplierTable).where(ilike(supplierTable.name, name)).limit(1)
      if (found) return found.id
      const [ins] = await db.insert(supplierTable).values({ organization_id: ctx!.organizationId, name }).returning({ id: supplierTable.id })
      return ins!.id
    })
    supplierIds.set(k, id)
    return id
  }

  /** Receive a row's opening stock into a product; "ok" or why it was skipped. */
  async function receive(productId: string, r: Plan["r"]): Promise<"ok" | string> {
    if (!r.opening_qty || r.opening_qty <= 0) return "ok"
    if (!branchId) return "opening stock skipped (no branch selected)"
    if (!r.expiry_date) return "opening stock skipped (no expiry date) — receive it with its expiry later"
    await withTenant(ctx!, (db) => db.insert(product_batch).values({
      organization_id: ctx!.organizationId, product_id: productId, branch_id: branchId!,
      batch_number: r.batch_number ?? "OPENING", expiry_date: r.expiry_date!,
      quantity_received: r.opening_qty!, quantity_remaining: r.opening_qty!,
      cost_price: r.cost_price == null ? null : String(r.cost_price), received_by: ctx!.userId,
    }))
    return "ok"
  }

  let created = 0, stockBatches = 0, stockAdded = 0, skipped = 0, failed = 0, packSizes = 0
  const errors: Array<{ row: number; name: string; error: string }> = []
  for (const x of rows) if (!x.ok) { failed++; errors.push({ row: x.row, name: x.name, error: x.error }) }
  const createdIdByRow = new Map<number, string>()

  for (const p of plans) {
    const r = p.r
    try {
      if (p.status === "duplicate") {
        const targetId = p.matchId ?? (p.matchRow != null ? createdIdByRow.get(p.matchRow) : undefined)
        const hasStock = !!r.opening_qty && r.opening_qty > 0
        if (onDuplicate === "add_stock" && targetId && hasStock) {
          const res = await receive(targetId, r)
          if (res === "ok") {
            stockAdded++; stockBatches++
            errors.push({ row: p.row, name: r.name, error: `Already in your products (${p.matchName}) — stock added to it` })
          } else {
            skipped++
            errors.push({ row: p.row, name: r.name, error: `Already in your products (${p.matchName}) — ${res}` })
          }
        } else {
          skipped++
          errors.push({ row: p.row, name: r.name, error: `Already in your products (${p.matchName}) — skipped` })
        }
        continue
      }

      const categoryId = await resolveCategoryId(p.category)
      const supplierId = await resolveSupplierId(r.supplier)
      const units = r.units_per_pack ?? 1
      const withPack = !!r.pack_selling_price && units > 1
      // Independent transaction per row so one failure doesn't roll back the rest.
      const newId = await withTenant(ctx, async (db) => {
        const [row] = await db.insert(product).values({
          organization_id: ctx.organizationId, created_by: ctx.userId, category_id: categoryId, supplier_id: supplierId,
          name: r.name, brand_name: r.brand_name ?? null, generic_name: p.fill.generic_name, manufacturer: p.fill.manufacturer ?? null,
          gtin: r.gtin ?? null, barcode_raw: r.barcode_raw ?? null, strength: p.fill.strength ?? null, dosage_form: p.fill.dosage_form ?? null,
          base_unit: p.fill.base_unit ?? "unit", pack_label: r.pack_label ?? null, units_per_pack: units,
          cost_price: r.cost_price == null ? null : String(r.cost_price), selling_price: String(r.selling_price),
          reorder_level: r.reorder_level ?? 10, is_controlled: p.fill.is_controlled, requires_prescription: p.fill.requires_prescription,
        }).returning({ id: product.id })
        // A full pack with its own price is sold as a pack size.
        if (withPack) {
          await db.insert(product_pack_size).values({
            product_id: row!.id, label: r.pack_label ?? "Pack", unit_count: units, selling_price: String(r.pack_selling_price),
            cost_price: r.cost_price == null ? null : String(Math.round(r.cost_price * units * 100) / 100),
          })
        }
        return row!.id
      })
      created++
      if (withPack) packSizes++
      createdIdByRow.set(p.row, newId)
      const res = await receive(newId, r)
      if (res !== "ok") errors.push({ row: p.row, name: r.name, error: `Product created, but ${res}` })
      else if (r.opening_qty && r.opening_qty > 0) stockBatches++
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : "Failed to create product"
      errors.push({ row: p.row, name: r.name, error: /unique|duplicate/i.test(msg) ? "That barcode or item code is already on another product" : msg })
    }
  }

  errors.sort((a, b) => a.row - b.row)
  return NextResponse.json({ created, stockBatches, stockAdded, skipped, failed, packSizes, total: rows.length, errors: errors.slice(0, 500) })
}
