import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, gt, gte, lte, asc, desc, ilike, inArray, sql } from "drizzle-orm"
import {
  withTenant, product, product_batch, product_pack_size, sale, sale_item, payment, controlled_substance_log, organization, user, org_settings,
} from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { apiError, zodErrorResponse } from "@/lib/api/errors"
import { resolveBranchScope } from "@/lib/inventory/aggregate"

interface Shortfall { product_id: string; product_name: string; requested: number; available: number }
// Thrown to roll back the sale transaction when stock is insufficient.
class InsufficientStockError extends Error {
  constructor(public shortfalls: Shortfall[]) { super("Insufficient stock") }
}

// Thrown when a submitted product_id doesn't resolve to a real, org-scoped
// product — either a stale/bad client payload, or a tampered request
// referencing a product that doesn't belong to this tenant.
class InvalidProductError extends Error {
  constructor(public productId: string, public productName: string) { super("Invalid product") }
}

const cartItemSchema = z.object({
  product_id: zUuid(),
  product_name: z.string(),
  product_strength: z.string().nullable(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  discount_percent: z.number().min(0).max(100).default(0),
  line_total: z.number().nonnegative(),
  base_unit: z.string(),
  is_controlled: z.boolean(),
  // Selling in a pack size (e.g. a strip of 10) instead of the base unit.
  // `quantity` is still in BASE units (what FEFO deducts); the pack size only
  // changes the price, which the server re-reads from product_pack_size.
  sell_unit: z.object({
    pack_size_id: zUuid(),
    unit_count: z.number().int().positive(),
  }).nullable().optional(),
})

const saleSchema = z.object({
  branch_id: zUuid(),
  shift_id: zUuid().nullable(),
  items: z.array(cartItemSchema).min(1),
  discount_amount: z.number().nonnegative().default(0),
  payment_method: z.enum(["cash", "mpesa", "split"]),
  amount_tendered: z.number().nonnegative().nullable(),
  change_given: z.number().nonnegative().nullable(),
  mpesa_reference: z.string().nullable(),
  // Only meaningful when payment_method === "split" - the cash/M-Pesa
  // breakdown, needed to record real per-method payment rows so shift
  // variance (which only counts actual cash) isn't blind to split sales.
  cash_amount: z.number().nonnegative().nullable().optional(),
  mpesa_amount: z.number().nonnegative().nullable().optional(),
  customer_name: z.string().nullable(),
  customer_phone: z.string().nullable(),
  // Idempotency key for offline sales — the server dedupes on it so a re-synced
  // sale never creates a duplicate.
  offline_reference: z.string().nullable().optional(),
})

function receiptNumber(seq: number): string {
  const d = new Date()
  const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  return `RCP-${yymmdd}-${String(seq).padStart(6, "0")}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get("branch_id")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const q = searchParams.get("q")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))

  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  // null → "All branches"; branch-locked staff are always pinned to their own.
  const scopedBranch = resolveBranchScope(ctx, branchId)

  return withTenant(ctx, async (db) => {
    const where = and(
      scopedBranch ? eq(sale.branch_id, scopedBranch) : undefined,
      eq(sale.status, "completed"),
      !ctx.permissions.includes("sales.view_all") ? eq(sale.cashier_id, ctx.userId) : undefined,
      from ? gte(sale.created_at, new Date(from)) : undefined,
      to ? lte(sale.created_at, new Date(to)) : undefined,
      q ? ilike(sale.receipt_number, `%${q}%`) : undefined,
    )

    const all = await db.select({
      row: sale, cashier_name: user.name,
    }).from(sale)
      .leftJoin(user, eq(user.id, sale.cashier_id))
      .where(where).orderBy(desc(sale.created_at))

    const total = all.length
    const offset = (page - 1) * limit
    const pageRows = all.slice(offset, offset + limit)
    const saleIds = pageRows.map((r) => r.row.id)

    const itemCounts: Record<string, number> = {}
    if (saleIds.length > 0) {
      const counts = await db.select({ sale_id: sale_item.sale_id, n: sql<number>`count(*)::int` })
        .from(sale_item).where(inArray(sale_item.sale_id, saleIds)).groupBy(sale_item.sale_id)
      for (const c of counts) itemCounts[c.sale_id] = c.n
    }

    const sales = pageRows.map(({ row, cashier_name }) => ({
      ...row,
      subtotal: Number(row.subtotal), discount_amount: Number(row.discount_amount),
      tax_amount: Number(row.tax_amount), total_amount: Number(row.total_amount),
      cashier_name: cashier_name ?? "—",
      item_count: itemCounts[row.id] ?? 0,
    }))

    return NextResponse.json({ sales, total, page, limit })
  })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  if (!ctx.permissions.includes("pos.sell")) return apiError("You don't have permission to sell", 403)

  const parsed = saleSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const data = parsed.data
  // No discount permission → any submitted discount is clamped to zero, the
  // same "clamp, never trust upward" rule the per-product cap uses below.
  const mayDiscount = ctx.permissions.includes("pos.discount")

  let out
  try {
    out = await withTenant(ctx, async (db) => {
    // ── Idempotency: a re-synced offline sale must not duplicate ──────────────
    if (data.offline_reference) {
      const [dupe] = await db.select().from(sale).where(eq(sale.offline_reference, data.offline_reference)).limit(1)
      if (dupe) return { sale: dupe, items: [], deduped: true }
    }

    const productIds = [...new Set(data.items.map((i) => i.product_id))]

    // ── Price guard: the server is the source of truth for money, never the
    // client — a request payload (mobile or web) is just as easy to tamper
    // with as any other client input, so unit_price/discount_percent/line_total
    // submitted by the caller are never trusted for the actual charge. Each
    // line is recomputed here from the product's current selling_price and
    // max_discount_percent (client's discount is only ever clamped down, never
    // trusted upward) before anything is persisted.
    const priceRows = await db.select({
      id: product.id, selling_price: product.selling_price, max_discount_percent: product.max_discount_percent,
      cost_price: product.cost_price,
    }).from(product).where(inArray(product.id, productIds))
    const priceMap = new Map(priceRows.map((p) => [p.id, {
      sellingPrice: Number(p.selling_price),
      maxDiscount: p.max_discount_percent != null ? Number(p.max_discount_percent) : 100,
      costPrice: p.cost_price,
    }]))

    const packIds = data.items.map((i) => i.sell_unit?.pack_size_id).filter((id): id is string => !!id)
    const packRows = packIds.length > 0
      ? await db.select({
          id: product_pack_size.id, product_id: product_pack_size.product_id, unit_count: product_pack_size.unit_count,
          selling_price: product_pack_size.selling_price, is_active: product_pack_size.is_active,
        }).from(product_pack_size).where(inArray(product_pack_size.id, packIds))
      : []
    const packMap = new Map(packRows.map((p) => [p.id, p]))

    const itemPricing = data.items.map((item) => {
      const priced = priceMap.get(item.product_id)
      if (!priced) throw new InvalidProductError(item.product_id, item.product_name)
      let unitPrice = priced.sellingPrice
      if (item.sell_unit) {
        const pack = packMap.get(item.sell_unit.pack_size_id)
        // The pack must belong to this product, be on sale, still contain the
        // same number of units, and the quantity must be whole packs.
        if (!pack || pack.product_id !== item.product_id || !pack.is_active ||
            pack.unit_count !== item.sell_unit.unit_count || item.quantity % pack.unit_count !== 0) {
          throw new InvalidProductError(item.product_id, item.product_name)
        }
        // Effective price per base unit, so FEFO-split lines still sum to
        // packs × pack price.
        unitPrice = Number(pack.selling_price) / pack.unit_count
      }
      const discountPercent = mayDiscount ? Math.min(item.discount_percent, priced.maxDiscount) : 0
      const lineTotal = Number((item.quantity * unitPrice * (1 - discountPercent / 100)).toFixed(2))
      return { unitPrice, discountPercent, lineTotal }
    })

    const subtotal = Number(itemPricing.reduce((s, p) => s + p.lineTotal, 0).toFixed(2))

    // ── Discount guard: mirrors CartPanel.tsx's maxAllowedDiscount UI warning,
    // except enforced here — that banner is cosmetic only ("manager approval
    // required") and nothing previously stopped a tampered request from
    // submitting any discount_amount at all. Capped by the most restrictive
    // max_discount_percent across the cart's actual products (server-fetched
    // priceMap, not client-claimed), same rule the UI computes for display.
    const discountCapPercent = Math.min(...data.items.map((item) => priceMap.get(item.product_id)!.maxDiscount))
    const maxDiscountAmount = (subtotal * discountCapPercent) / 100
    const discountAmount = mayDiscount ? Math.min(data.discount_amount, maxDiscountAmount) : 0
    const totalAmount = Math.max(0, Number((subtotal - discountAmount).toFixed(2)))

    // ── Stock guard: never sell more than is on hand for this branch ──────────
    const availRows = await db.select({
      pid: product_batch.product_id,
      avail: sql<number>`coalesce(sum(${product_batch.quantity_remaining}), 0)::int`,
    }).from(product_batch)
      .where(and(eq(product_batch.branch_id, data.branch_id), inArray(product_batch.product_id, productIds), gt(product_batch.quantity_remaining, 0)))
      .groupBy(product_batch.product_id)
    const availMap = new Map(availRows.map((r) => [r.pid, Number(r.avail)]))

    const requested = new Map<string, number>()
    for (const i of data.items) requested.set(i.product_id, (requested.get(i.product_id) ?? 0) + i.quantity)

    const shortfalls: Shortfall[] = []
    for (const [pid, qty] of requested) {
      const avail = availMap.get(pid) ?? 0
      if (qty > avail) {
        shortfalls.push({ product_id: pid, product_name: data.items.find((i) => i.product_id === pid)?.product_name ?? "Item", requested: qty, available: avail })
      }
    }
    if (shortfalls.length > 0) throw new InsufficientStockError(shortfalls)

    const seqRows = (await db.execute(sql`select nextval('receipt_number_seq')::int as n`)) as unknown as Array<{ n: number }>
    const receipt = receiptNumber(seqRows[0]!.n)

    const [saleRow] = await db.insert(sale).values({
      organization_id: ctx.organizationId,
      branch_id: data.branch_id,
      shift_id: data.shift_id,
      cashier_id: ctx.userId,
      receipt_number: receipt,
      status: "completed",
      subtotal: String(subtotal),
      discount_amount: String(discountAmount),
      tax_amount: "0",
      total_amount: String(totalAmount),
      payment_method: data.payment_method,
      offline_reference: data.offline_reference ?? null,
      amount_tendered: data.amount_tendered != null ? String(data.amount_tendered) : null,
      change_given: data.change_given != null ? String(data.change_given) : null,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
    }).returning()

    // Build sale_item rows with FEFO batch deduction. `meta` runs parallel to the
    // insert array so we can attach controlled-substance logs to the right line.
    const rows: Array<typeof sale_item.$inferInsert> = []
    const meta: Array<{ controlled: boolean; batch_number: string | null }> = []

    for (let idx = 0; idx < data.items.length; idx++) {
      const item = data.items[idx]!
      const priced = itemPricing[idx]!
      const batches = await db.select({
        id: product_batch.id, quantity_remaining: product_batch.quantity_remaining, batch_number: product_batch.batch_number,
        cost_price: product_batch.cost_price,
      }).from(product_batch)
        .where(and(eq(product_batch.product_id, item.product_id), eq(product_batch.branch_id, data.branch_id), gt(product_batch.quantity_remaining, 0)))
        .orderBy(asc(product_batch.expiry_date))

      let remaining = item.quantity
      for (const batch of batches) {
        if (remaining <= 0) break
        const take = Math.min(remaining, batch.quantity_remaining)
        // Atomic decrement that only succeeds if the stock is still there. The
        // old version guarded on the exact previous quantity but never checked
        // whether the UPDATE matched — a concurrent sale made it a silent no-op
        // and the line was recorded anyway (oversold). Now a lost race simply
        // skips this batch; the shortfall check below rejects if nothing's left.
        const [dec] = await db.update(product_batch)
          .set({ quantity_remaining: sql`${product_batch.quantity_remaining} - ${take}` })
          .where(and(eq(product_batch.id, batch.id), gte(product_batch.quantity_remaining, take)))
          .returning({ id: product_batch.id })
        if (!dec) continue
        rows.push({
          sale_id: saleRow!.id, product_id: item.product_id, batch_id: batch.id,
          product_name: item.product_name, quantity: take, unit_price: priced.unitPrice.toFixed(2),
          discount_percent: String(priced.discountPercent),
          line_total: String(Number((take * priced.unitPrice * (1 - priced.discountPercent / 100)).toFixed(2))),
          base_unit: item.base_unit, product_strength: item.product_strength,
          unit_cost: batch.cost_price ?? priceMap.get(item.product_id)?.costPrice ?? null,
        })
        meta.push({ controlled: item.is_controlled, batch_number: batch.batch_number })
        remaining -= take
      }

      // Pre-checked above, but a concurrent sale may have depleted a batch
      // between the check and our optimistic decrement — reject rather than
      // record an unbacked (oversold) line.
      if (remaining > 0) {
        throw new InsufficientStockError([{
          product_id: item.product_id, product_name: item.product_name,
          requested: item.quantity, available: item.quantity - remaining,
        }])
      }
    }

    const inserted = await db.insert(sale_item).values(rows).returning()

    // Controlled-substance register: one entry per dispensed batch line.
    const csRows = inserted
      .map((row, idx) => ({ row, m: meta[idx]! }))
      .filter(({ m }) => m.controlled && m.batch_number)
      .map(({ row, m }) => ({
        organization_id: ctx.organizationId, sale_item_id: row.id,
        quantity: row.quantity, batch_number: m.batch_number,
      }))
    if (csRows.length > 0) await db.insert(controlled_substance_log).values(csRows)

    // Payment detail (cash/mpesa/split). A split sale gets one row per
    // method it actually used, so shift variance (which sums payment.amount
    // where method='cash') sees the real cash collected instead of treating
    // the whole split total as non-cash.
    if (data.payment_method === "split") {
      const cashAmt = data.cash_amount ?? 0
      const mpesaAmt = data.mpesa_amount ?? Math.max(0, totalAmount - cashAmt)
      const rows = []
      if (cashAmt > 0) rows.push({ sale_id: saleRow!.id, method: "cash", amount: String(cashAmt) })
      if (mpesaAmt > 0) rows.push({ sale_id: saleRow!.id, method: "mpesa", amount: String(mpesaAmt), mpesa_receipt: data.mpesa_reference })
      if (rows.length > 0) await db.insert(payment).values(rows)
    } else {
      await db.insert(payment).values({
        sale_id: saleRow!.id, method: data.payment_method, amount: String(totalAmount),
        mpesa_receipt: data.mpesa_reference,
      })
    }

    const items = inserted.map((row) => ({
      ...row,
      selling_price: Number(row.unit_price), unit_price: Number(row.unit_price),
      line_total: Number(row.line_total), discount_percent: Number(row.discount_percent),
    }))

    const [org] = await db.select({ name: organization.name }).from(organization)
      .where(eq(organization.id, ctx.organizationId)).limit(1)
    const [settingsRow] = await db.select({ settings: org_settings.settings }).from(org_settings)
      .where(eq(org_settings.organization_id, ctx.organizationId)).limit(1)
    const paperWidth = (settingsRow?.settings as { receipt_paper_width?: string } | undefined)?.receipt_paper_width ?? "80mm"

    const saleOut = {
      ...saleRow,
      subtotal: Number(saleRow!.subtotal), discount_amount: Number(saleRow!.discount_amount),
      tax_amount: Number(saleRow!.tax_amount), total_amount: Number(saleRow!.total_amount),
      amount_tendered: data.amount_tendered, change_given: data.change_given,
      mpesa_reference: data.mpesa_reference, customer_name: data.customer_name, customer_phone: data.customer_phone,
      org_name: org?.name ?? null,
    }
    return { sale: saleOut, items, paperWidth }
    })
  } catch (e) {
    if (e instanceof InvalidProductError) {
      return NextResponse.json(
        { error: `Unknown product: ${e.productName}`, code: "invalid_product" },
        { status: 400 },
      )
    }
    if (e instanceof InsufficientStockError) {
      const names = e.shortfalls.map((s) => `${s.product_name} (have ${s.available}, need ${s.requested})`).join(", ")
      // `error` carries the user-facing text (postJson surfaces it to a toast);
      // `code` + `shortfalls` are for programmatic handling (offline sync).
      return NextResponse.json(
        { error: `Not enough stock: ${names}`, code: "insufficient_stock", shortfalls: e.shortfalls },
        { status: 409 },
      )
    }
    // Concurrent re-sync of the same offline sale hit the offline_reference unique
    // constraint — it's already recorded, so treat as success (idempotent).
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") {
      return NextResponse.json({ deduped: true }, { status: 200 })
    }
    throw e
  }

  return NextResponse.json(out, { status: 201 })
}
