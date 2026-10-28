import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm"
import { withTenant, product, product_batch, stock_count, stock_count_line, user, type DrizzleDB } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { zodErrorResponse } from "@/lib/api/errors"
import { canViewCost } from "@/lib/auth/costVisibility"
import { loadShelfItems, stockTakeContext, type StockTakeItem } from "@/lib/stockTake/server"

// One stock-take session: GET what's on the shelf and what has been counted,
// PUT autosaves counted lines, PATCH cancels or reopens it (ADR-020).

type Params = { params: Promise<{ id: string }> }
type Session = typeof stock_count.$inferSelect

async function loadSession(db: DrizzleDB, id: string): Promise<Session | null> {
  const [s] = await db.select().from(stock_count).where(eq(stock_count.id, id)).limit(1)
  return s ?? null
}

const hidesQty = (s: Session) => s.hide_expected && s.status === "draft"

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params
  if (!zUuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const r = await stockTakeContext()
  if ("error" in r) return r.error
  const { ctx } = r
  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim().slice(0, 60) || undefined
  const all = url.searchParams.get("all") === "1"
  const showCost = canViewCost(ctx)

  const out = await withTenant(ctx, async (db) => {
    const session = await loadSession(db, id)
    if (!session) return null
    const hideQty = hidesQty(session)
    let items = await loadShelfItems(db, {
      organizationId: ctx.organizationId, branchId: session.branch_id,
      scope: { categoryId: session.scope_category_id, key: session.scope_key },
      includeCatalog: session.kind === "setup" || !!q, all, q, showCost, hideQty,
    })
    if (q) {
      // "Found something not on this list": the pharmacy's own products from
      // any shelf, then catalogue matches.
      const needle = q.toLowerCase()
      items = items.filter((i) => i.name.toLowerCase().includes(needle) || i.detail.toLowerCase().includes(needle) || i.barcodes.includes(q))
      const have = new Set(items.map((i) => i.productId).filter(Boolean))
      const own = await db.select({
        id: product.id, name: product.name, strength: product.strength, dosage_form: product.dosage_form, base_unit: product.base_unit,
        pack_label: product.pack_label, units_per_pack: product.units_per_pack, cost_price: product.cost_price, selling_price: product.selling_price,
        is_active: product.is_active, is_controlled: product.is_controlled, gtin: product.gtin, barcode_raw: product.barcode_raw, catalog_id: product.catalog_id,
      }).from(product).where(or(ilike(product.name, `%${q}%`), eq(product.gtin, q), eq(product.barcode_raw, q))).orderBy(asc(product.name)).limit(20)
      const extra = own.filter((p) => !have.has(p.id))
      const batches = extra.length ? await db.select({ id: product_batch.id, product_id: product_batch.product_id, batch_number: product_batch.batch_number, expiry_date: product_batch.expiry_date, qty: product_batch.quantity_remaining, cost_price: product_batch.cost_price })
        .from(product_batch).where(and(inArray(product_batch.product_id, extra.map((p) => p.id)), eq(product_batch.branch_id, session.branch_id))).orderBy(asc(product_batch.expiry_date)) : []
      const mapped: StockTakeItem[] = extra.map((p) => ({
        key: `p:${p.id}`, productId: p.id, catalogId: p.catalog_id, name: p.name, detail: [p.strength, p.dosage_form, p.pack_label].filter(Boolean).join(" · "),
        group: "Found on this shelf", baseUnit: p.base_unit, packLabel: p.pack_label, unitsPerPack: p.units_per_pack ?? 1, controlled: p.is_controlled,
        needsPrice: !(Number(p.selling_price ?? 0) > 0) || !p.is_active, sellingPrice: p.selling_price == null ? null : Number(p.selling_price),
        suggestedSell: null, suggestedCost: null, costPrice: showCost && p.cost_price != null ? Number(p.cost_price) : null,
        barcodes: [p.gtin, p.barcode_raw].filter(Boolean) as string[], common: true,
        batches: batches.filter((b) => b.product_id === p.id && b.qty > 0).map((b) => ({
          id: b.id, batchNumber: b.batch_number, expiry: String(b.expiry_date), qty: hideQty ? null : b.qty,
          unitCost: showCost && b.cost_price != null ? Number(b.cost_price) : null,
        })),
      }))
      items = [...mapped, ...items]
    }
    const lines = await db.select({
      id: stock_count_line.id, product_id: stock_count_line.product_id, catalog_id: stock_count_line.catalog_id, batch_id: stock_count_line.batch_id,
      batch_number: stock_count_line.batch_number, expiry_date: stock_count_line.expiry_date, barcode: stock_count_line.barcode,
      expected_qty: stock_count_line.expected_qty, counted_qty: stock_count_line.counted_qty,
      selling_price: stock_count_line.selling_price, cost_price: stock_count_line.cost_price, price_confirmed: stock_count_line.price_confirmed,
      counted_by: user.name, counted_at: stock_count_line.counted_at,
    }).from(stock_count_line).leftJoin(user, eq(user.id, stock_count_line.counted_by)).where(eq(stock_count_line.count_id, id))
    return {
      session: {
        id: session.id, kind: session.kind, title: session.title, status: session.status, hide_expected: session.hide_expected,
        branch_id: session.branch_id, scope_key: session.scope_key, totals: session.totals, posted_at: session.posted_at,
      },
      items,
      lines: lines.map((l) => ({
        ...l, expiry_date: l.expiry_date ? String(l.expiry_date) : null,
        expected_qty: hideQty ? null : l.expected_qty,
        selling_price: l.selling_price == null ? null : Number(l.selling_price),
        cost_price: showCost && l.cost_price != null ? Number(l.cost_price) : null,
      })),
    }
  })
  if (!out) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    ...out,
    can: {
      adjust: ctx.permissions.includes("stock.adjust"),
      setup: ctx.permissions.includes("products.create") && ctx.permissions.includes("stock.receive"),
      editPrice: ctx.permissions.includes("products.edit"),
      viewCost: showCost,
    },
  })
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
const lineSchema = z.object({
  id: zUuid(),
  product_id: zUuid().nullable().optional(),
  catalog_id: zUuid().nullable().optional(),
  batch_id: zUuid().nullable().optional(),
  batch_number: z.string().trim().max(60).nullable().optional(),
  expiry_date: date.nullable().optional(),
  barcode: z.string().trim().max(80).nullable().optional(),
  counted_qty: z.number().int().min(0).max(1_000_000),
  selling_price: z.number().nonnegative().max(10_000_000).nullable().optional(),
  cost_price: z.number().nonnegative().max(10_000_000).nullable().optional(),
  price_confirmed: z.boolean().optional(),
}).refine((l) => l.product_id || l.catalog_id, { message: "A line needs a product" })
  .refine((l) => !l.batch_id || l.product_id, { message: "A batch line needs its product" })
  .refine((l) => l.batch_id || l.expiry_date, { message: "Add the expiry month for a new batch" })
const putSchema = z.object({
  lines: z.array(lineSchema).max(500).default([]),
  delete_ids: z.array(zUuid()).max(500).default([]),
})

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params
  if (!zUuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const r = await stockTakeContext()
  if ("error" in r) return r.error
  const { ctx } = r
  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const { lines, delete_ids } = parsed.data
  const showCost = canViewCost(ctx)

  const out = await withTenant(ctx, async (db) => {
    const session = await loadSession(db, id)
    if (!session) return { status: 404, body: { error: "Not found" } }
    if (session.status === "posted" || session.status === "cancelled") return { status: 409, body: { error: "This stock take is already finished." } }

    const ids = [...lines.map((l) => l.id), ...delete_ids]
    const existing = ids.length ? await db.select({ id: stock_count_line.id, count_id: stock_count_line.count_id, counted_qty: stock_count_line.counted_qty, batch_id: stock_count_line.batch_id, expected_qty: stock_count_line.expected_qty })
      .from(stock_count_line).where(inArray(stock_count_line.id, ids)) : []
    if (existing.some((e) => e.count_id !== id)) return { status: 400, body: { error: "Invalid line" } }
    const before = new Map(existing.map((e) => [e.id, e]))

    const batchIds = [...new Set(lines.map((l) => l.batch_id).filter(Boolean) as string[])]
    const batches = batchIds.length ? await db.select({ id: product_batch.id, product_id: product_batch.product_id, branch_id: product_batch.branch_id, q: product_batch.quantity_remaining })
      .from(product_batch).where(inArray(product_batch.id, batchIds)) : []
    const bById = new Map(batches.map((b) => [b.id, b]))

    const now = new Date()
    for (const l of lines) {
      let expected: number | null = null
      if (l.batch_id) {
        const b = bById.get(l.batch_id)
        if (!b || b.branch_id !== session.branch_id || b.product_id !== l.product_id) return { status: 400, body: { error: "That batch isn't at this branch" } }
        const prev = before.get(l.id)
        // The recorded quantity at the moment this batch was counted (ADR-020).
        expected = prev && prev.batch_id === l.batch_id && prev.counted_qty === l.counted_qty && prev.expected_qty != null ? prev.expected_qty : b.q
      }
      const confirmed = !!l.price_confirmed && Number(l.selling_price ?? 0) > 0
      const values = {
        product_id: l.product_id ?? null, catalog_id: l.product_id ? null : l.catalog_id ?? null, batch_id: l.batch_id ?? null,
        batch_number: l.batch_id ? null : l.batch_number || null, expiry_date: l.batch_id ? null : l.expiry_date ?? null,
        barcode: l.barcode || null, expected_qty: expected, counted_qty: l.counted_qty,
        selling_price: confirmed ? String(l.selling_price) : null,
        cost_price: showCost && l.cost_price != null ? String(l.cost_price) : null,
        price_confirmed: confirmed, counted_by: ctx.userId, counted_at: now,
      }
      await db.insert(stock_count_line).values({ id: l.id, organization_id: ctx.organizationId, count_id: id, ...values })
        .onConflictDoUpdate({ target: stock_count_line.id, set: values })
    }
    if (delete_ids.length) await db.delete(stock_count_line).where(and(eq(stock_count_line.count_id, id), inArray(stock_count_line.id, delete_ids)))
    // Editing a session waiting for approval sends it back to counting.
    await db.update(stock_count).set({ updated_at: now, ...(session.status === "review" ? { status: "draft" as const } : {}) }).where(eq(stock_count.id, id))
    return { status: 200, body: { saved: lines.length, deleted: delete_ids.length } }
  })
  return NextResponse.json(out.body, { status: out.status })
}

const patchSchema = z.object({ action: z.enum(["cancel", "reopen"]) })

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  if (!zUuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const r = await stockTakeContext()
  if ("error" in r) return r.error
  const { ctx } = r
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return zodErrorResponse(parsed.error)

  const out = await withTenant(ctx, async (db) => {
    const session = await loadSession(db, id)
    if (!session) return { status: 404, body: { error: "Not found" } }
    if (session.status === "posted" || session.status === "cancelled") return { status: 409, body: { error: "This stock take is already finished." } }
    const status = parsed.data.action === "cancel" ? "cancelled" as const : "draft" as const
    await db.update(stock_count).set({ status, updated_at: new Date() }).where(eq(stock_count.id, id))
    return { status: 200, body: { status } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
