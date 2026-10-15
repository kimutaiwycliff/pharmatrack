import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, inArray, sql } from "drizzle-orm"
import { dbAdmin, drug_catalog, withTenant, branch as branchTable, product, product_batch, category as categoryTable } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { deriveGenericName } from "@/lib/generic-name"

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
    brand_name: z.string().trim().optional(),
    manufacturer: z.string().trim().optional(),
    gtin: z.string().trim().optional(),
    strength: z.string().trim().optional(),
    dosage_form: z.string().trim().optional(),
    base_unit: z.string().trim().optional(),
    category: z.string().trim().optional(),
    subcategory: z.string().trim().optional(),
    pack_label: z.string().trim().optional(),
    units_per_pack: z.coerce.number().int().positive().optional(),
    cost_price: z.coerce.number().nonnegative().optional(),
    selling_price: z.coerce.number().positive("selling_price must be greater than 0"),
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
      brand_name: clean(r.brand_name), manufacturer: clean(r.manufacturer), gtin: clean(r.gtin),
      strength: clean(r.strength), dosage_form: clean(r.dosage_form), base_unit: clean(r.base_unit),
      category: clean(r.category), subcategory: clean(r.subcategory),
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
})

const key = (name: string, strength?: string | null, form?: string | null) =>
  `${name.trim().toLowerCase()}|${(strength ?? "").trim().toLowerCase()}|${(form ?? "").trim().toLowerCase()}`

// Bulk import (web BulkImportDialog, Android inventory-import). Every row is
// checked against your products first — same barcode, or same name + strength
// + form (POST /api/products' rule) — and against earlier rows of the same
// file, so re-importing a sheet never doubles the catalogue. Blank form, unit,
// manufacturer and Rx/controlled cells are filled from the shared drug
// catalogue when the name (+ strength) matches one entry.
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
      ? { row: i + 1, ok: true as const, r: r.data }
      : { row: i + 1, ok: false as const, name: String((raw as Record<string, unknown>).name ?? "—"), error: r.error.issues[0]?.message ?? "Invalid row" }
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

  // Shared catalogue rows with the same names: fill what the sheet left out.
  const names = [...new Set(valid.map((x) => x.r.name.trim().toLowerCase()))]
  const catalog = names.length
    ? await dbAdmin().select({
        name: drug_catalog.name, strength: drug_catalog.strength, generic_name: drug_catalog.generic_name,
        dosage_form: drug_catalog.dosage_form, base_unit: drug_catalog.base_unit, manufacturer: drug_catalog.manufacturer,
        is_controlled: drug_catalog.is_controlled, requires_prescription: drug_catalog.requires_prescription, source: drug_catalog.source,
      }).from(drug_catalog).where(inArray(sql`lower(${drug_catalog.name})`, names))
    : []
  function catalogMatch(name: string, strength?: string) {
    const same = catalog.filter((c) => c.name.toLowerCase() === name.trim().toLowerCase())
    const s = strength?.replace(/\s+/g, "").toLowerCase()
    const hits = s ? same.filter((c) => (c.strength ?? "").replace(/\s+/g, "").toLowerCase() === s) : same
    if (hits.length === 0) return null
    const curated = hits.filter((c) => c.source === "curated")
    const pool = curated.length ? curated : hits
    // Without a strength, only trust a single unambiguous entry.
    return s || pool.length === 1 ? pool[0]! : null
  }

  type Plan = {
    row: number; r: (typeof valid)[number]["r"]; status: "new" | "duplicate"
    /** Existing product, or the earlier row of this file it repeats. */
    matchId?: string; matchRow?: number; matchName?: string
    fill: { generic_name: string | null; dosage_form?: string; base_unit?: string; manufacturer?: string; is_controlled: boolean; requires_prescription: boolean }
    filled: string[]
  }
  const plans: Plan[] = []
  const firstRowByKey = new Map<string, number>()
  for (const x of valid) {
    const r = x.r
    const c = catalogMatch(r.name, r.strength)
    const filled: string[] = []
    const take = <T,>(given: T | undefined, fromCatalog: T | null | undefined, label: string): T | undefined => {
      if (given !== undefined) return given
      if (fromCatalog != null) { filled.push(label); return fromCatalog }
      return undefined
    }
    const fill = {
      generic_name: c?.generic_name ?? deriveGenericName(r.name),
      dosage_form: take(r.dosage_form, c?.dosage_form, "form"),
      base_unit: take(r.base_unit, c?.base_unit, "unit"),
      manufacturer: take(r.manufacturer, c?.manufacturer, "manufacturer"),
      is_controlled: take(toBool(r.is_controlled), c?.is_controlled, "controlled flag") ?? false,
      requires_prescription: take(toBool(r.requires_prescription), c?.requires_prescription, "Rx flag") ?? false,
    }
    const k = key(r.name, r.strength, fill.dosage_form)
    const dupe = (r.gtin ? byCode.get(r.gtin) : undefined) ?? byKey.get(k) ?? byKey.get(key(r.name, r.strength, r.dosage_form))
    if (dupe) {
      plans.push({ row: x.row, r, status: "duplicate", matchId: dupe.id, matchName: [dupe.name, dupe.strength].filter(Boolean).join(" "), fill, filled })
    } else if (firstRowByKey.has(k)) {
      const first = firstRowByKey.get(k)!
      plans.push({ row: x.row, r, status: "duplicate", matchRow: first, matchName: `row ${first} of this file`, fill, filled })
    } else {
      firstRowByKey.set(k, x.row)
      plans.push({ row: x.row, r, status: "new", fill, filled })
    }
  }

  if (dryRun) {
    const report = [
      ...rows.flatMap((x) => (x.ok ? [] : [{ row: x.row, name: x.name, status: "invalid" as const, error: x.error }])),
      ...plans.map((p) => ({ row: p.row, name: p.r.name, status: p.status, match: p.matchName, filled: p.filled.length ? p.filled : undefined })),
    ].sort((a, b) => a.row - b.row)
    return NextResponse.json({
      dry_run: true,
      total: rows.length,
      new: plans.filter((p) => p.status === "new").length,
      duplicates: plans.filter((p) => p.status === "duplicate").length,
      invalid: rows.length - valid.length,
      filled_from_catalog: plans.filter((p) => p.filled.length > 0).length,
      rows: report,
    })
  }

  // Category resolver — materialises a two-level taxonomy (department > sub) the
  // same way Quick Start does, cached across rows. Created categories are
  // committed in their own tx, so the cache stays consistent for later rows.
  const existingCats = await withTenant(ctx, (db) =>
    db.select({ id: categoryTable.id, name: categoryTable.name, parent_id: categoryTable.parent_id }).from(categoryTable),
  )
  const parentByName = new Map(existingCats.filter((c) => !c.parent_id).map((c) => [c.name, c.id]))
  const childKey = (pid: string, name: string) => `${pid}::${name}`
  const childByKey = new Map(existingCats.filter((c) => c.parent_id).map((c) => [childKey(c.parent_id!, c.name), c.id]))

  async function resolveCategoryId(catName?: string, subName?: string): Promise<string | null> {
    if (!catName) return null
    let pid = parentByName.get(catName)
    if (!pid) {
      const [ins] = await withTenant(ctx!.organizationId, (db) =>
        db.insert(categoryTable).values({ organization_id: ctx!.organizationId, name: catName }).returning({ id: categoryTable.id }))
      pid = ins!.id; parentByName.set(catName, pid)
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

  /** Receive a row's opening stock into a product; "ok" or why it was skipped. */
  async function receive(productId: string, r: Plan["r"]): Promise<"ok" | string> {
    if (!r.opening_qty || r.opening_qty <= 0) return "ok"
    if (!branchId) return "opening stock skipped (no branch selected)"
    if (!r.expiry_date) return "opening stock skipped (missing expiry_date)"
    await withTenant(ctx!, (db) => db.insert(product_batch).values({
      organization_id: ctx!.organizationId, product_id: productId, branch_id: branchId!,
      batch_number: r.batch_number ?? "OPENING", expiry_date: r.expiry_date!,
      quantity_received: r.opening_qty!, quantity_remaining: r.opening_qty!,
      cost_price: r.cost_price == null ? null : String(r.cost_price), received_by: ctx!.userId,
    }))
    return "ok"
  }

  let created = 0, stockBatches = 0, stockAdded = 0, skipped = 0, failed = 0
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

      const categoryId = await resolveCategoryId(r.category, r.subcategory)
      // Independent transaction per row so one failure doesn't roll back the rest.
      const newId = await withTenant(ctx, async (db) => {
        const [row] = await db.insert(product).values({
          organization_id: ctx.organizationId, created_by: ctx.userId, category_id: categoryId,
          name: r.name, brand_name: r.brand_name ?? null, generic_name: p.fill.generic_name, manufacturer: p.fill.manufacturer ?? null,
          gtin: r.gtin ?? null, strength: r.strength ?? null, dosage_form: p.fill.dosage_form ?? null,
          base_unit: p.fill.base_unit ?? "unit", pack_label: r.pack_label ?? null, units_per_pack: r.units_per_pack ?? 1,
          cost_price: r.cost_price == null ? null : String(r.cost_price), selling_price: String(r.selling_price),
          reorder_level: r.reorder_level ?? 10, is_controlled: p.fill.is_controlled, requires_prescription: p.fill.requires_prescription,
        }).returning({ id: product.id })
        return row!.id
      })
      created++
      createdIdByRow.set(p.row, newId)
      const res = await receive(newId, r)
      if (res !== "ok") errors.push({ row: p.row, name: r.name, error: `Product created, but ${res}` })
      else if (r.opening_qty && r.opening_qty > 0) stockBatches++
    } catch (e) {
      failed++
      errors.push({ row: p.row, name: r.name, error: e instanceof Error ? e.message : "Failed to create product" })
    }
  }

  errors.sort((a, b) => a.row - b.row)
  return NextResponse.json({ created, stockBatches, stockAdded, skipped, failed, total: rows.length, errors: errors.slice(0, 200) })
}
