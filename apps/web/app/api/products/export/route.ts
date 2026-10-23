import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm"
import {
  withTenant, product, product_batch, product_pack_size, category, supplier, branch as branchTable, organization, audit_log,
} from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { canViewCost } from "@/lib/auth/costVisibility"
import { zUuid } from "@/lib/api/validation"
import type { ExportProduct } from "@/lib/inventory/exportRows"

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  // A category id (a department includes its subcategories) or "none".
  category_id: z.union([zUuid(), z.literal("none")]).optional(),
  // Stock at this branch, one row per batch — owners only.
  stock_branch_id: zUuid().optional(),
})

// GET /api/products/export — the pharmacy's active products in the import
// template's shape (components/inventory/ExportProductsDialog.tsx writes the
// .xlsx). Same filters as the Products list. Costs only for people who can
// see them; stock (by batch, at one branch) only for the owner. Every export
// is written to the audit log — the file carries the whole price list.
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!ctx.permissions.includes("products.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const sp = new URL(request.url).searchParams
  const parsed = querySchema.safeParse({
    q: sp.get("q") || undefined, category_id: sp.get("category_id") || undefined, stock_branch_id: sp.get("stock_branch_id") || undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { q, category_id: categoryId, stock_branch_id: stockBranchId } = parsed.data
  if (stockBranchId && ctx.role !== "owner") {
    return NextResponse.json({ error: "Only the pharmacy owner can export stock" }, { status: 403 })
  }
  const withCost = canViewCost(ctx)

  const out = await withTenant(ctx, async (db) => {
    const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, ctx.organizationId)).limit(1)
    let branchName: string | null = null
    if (stockBranchId) {
      const [b] = await db.select({ name: branchTable.name }).from(branchTable).where(eq(branchTable.id, stockBranchId)).limit(1)
      if (!b) return { error: "Branch not found" as const }
      branchName = b.name
    }

    const where = and(
      eq(product.is_active, true),
      q && q.length >= 2
        ? or(ilike(product.name, `%${q}%`), ilike(product.brand_name, `%${q}%`), ilike(product.gtin, `%${q}%`), ilike(product.strength, `%${q}%`))
        : undefined,
      categoryId === "none"
        ? isNull(product.category_id)
        : categoryId
          ? or(eq(product.category_id, categoryId), sql`${product.category_id} IN (SELECT id FROM category WHERE parent_id = ${categoryId})`)
          : undefined,
    )
    const products = await db.select().from(product).where(where).orderBy(asc(product.name))
    const ids = products.map((p) => p.id)

    const cats = await db.select({ id: category.id, name: category.name, parent_id: category.parent_id }).from(category)
    const catById = new Map(cats.map((c) => [c.id, c]))
    const sups = await db.select({ id: supplier.id, name: supplier.name }).from(supplier)
    const supById = new Map(sups.map((s) => [s.id, s.name]))
    const packs = ids.length
      ? await db.select({ product_id: product_pack_size.product_id, unit_count: product_pack_size.unit_count, selling_price: product_pack_size.selling_price })
        .from(product_pack_size).where(and(inArray(product_pack_size.product_id, ids), eq(product_pack_size.is_active, true)))
      : []
    const batches = stockBranchId && ids.length
      ? await db.select({
          product_id: product_batch.product_id, batch_number: product_batch.batch_number, expiry_date: product_batch.expiry_date,
          quantity: product_batch.quantity_remaining,
        }).from(product_batch)
          .where(and(eq(product_batch.branch_id, stockBranchId), gt(product_batch.quantity_remaining, 0), inArray(product_batch.product_id, ids)))
          .orderBy(asc(product_batch.expiry_date))
      : []

    const rows: ExportProduct[] = products.map((p) => {
      const c = p.category_id ? catById.get(p.category_id) : undefined
      const parent = c?.parent_id ? catById.get(c.parent_id) : undefined
      const units = p.units_per_pack > 0 ? p.units_per_pack : 1
      // A full pack with its own price (an active pack size the size of the product's pack).
      const pack = packs.find((k) => k.product_id === p.id && k.unit_count === units && units > 1)
      return {
        name: p.name, generic_name: p.generic_name, strength: p.strength, dosage_form: p.dosage_form, gtin: p.gtin, barcode_raw: p.barcode_raw,
        category: parent ? parent.name : (c?.name ?? null), subcategory: parent ? (c?.name ?? null) : null,
        base_unit: p.base_unit, pack_label: p.pack_label, units_per_pack: units,
        cost_price: withCost && p.cost_price != null ? Number(p.cost_price) : null,
        selling_price: Number(p.selling_price), pack_selling_price: pack ? Number(pack.selling_price) : null,
        reorder_level: p.reorder_level, requires_prescription: p.requires_prescription, is_controlled: p.is_controlled,
        supplier: p.supplier_id ? (supById.get(p.supplier_id) ?? null) : null,
        ...(stockBranchId ? {
          batches: batches.filter((b) => b.product_id === p.id).map((b) => ({ batch_number: b.batch_number, expiry_date: String(b.expiry_date), quantity: b.quantity })),
        } : {}),
      }
    })

    await db.insert(audit_log).values({
      organization_id: ctx.organizationId, actor_id: ctx.userId, action: "products.export", entity: "product",
      diff: { rows: rows.length, stock_branch_id: stockBranchId ?? null, with_cost: withCost, q: q ?? null, category_id: categoryId ?? null },
    })
    return { org: org?.name ?? "Pharmacy", branch: branchName, with_cost: withCost, products: rows }
  })

  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 404 })
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } })
}
