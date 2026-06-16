import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, gt, asc, sql } from "drizzle-orm"
import {
  withTenant, product_batch, sale, sale_item, payment, controlled_substance_log,
} from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { apiError, zodErrorResponse } from "@/lib/api/errors"

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
  customer_name: z.string().nullable(),
  customer_phone: z.string().nullable(),
})

function receiptNumber(seq: number): string {
  const d = new Date()
  const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  return `RCP-${yymmdd}-${String(seq).padStart(6, "0")}`
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)

  const parsed = saleSchema.safeParse(await request.json())
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const data = parsed.data

  const subtotal = Number(data.items.reduce((s, i) => s + i.line_total, 0).toFixed(2))
  const totalAmount = Math.max(0, Number((subtotal - data.discount_amount).toFixed(2)))

  const out = await withTenant(ctx.organizationId, async (db) => {
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
      discount_amount: String(data.discount_amount),
      tax_amount: "0",
      total_amount: String(totalAmount),
      payment_method: data.payment_method,
    }).returning()

    // Build sale_item rows with FEFO batch deduction. `meta` runs parallel to the
    // insert array so we can attach controlled-substance logs to the right line.
    const rows: Array<typeof sale_item.$inferInsert> = []
    const meta: Array<{ base_unit: string; product_strength: string | null; controlled: boolean; batch_number: string | null }> = []

    for (const item of data.items) {
      const batches = await db.select({
        id: product_batch.id, quantity_remaining: product_batch.quantity_remaining, batch_number: product_batch.batch_number,
      }).from(product_batch)
        .where(and(eq(product_batch.product_id, item.product_id), eq(product_batch.branch_id, data.branch_id), gt(product_batch.quantity_remaining, 0)))
        .orderBy(asc(product_batch.expiry_date))

      let remaining = item.quantity
      for (const batch of batches) {
        if (remaining <= 0) break
        const take = Math.min(remaining, batch.quantity_remaining)
        // Optimistic decrement — guard on current qty against concurrent sales.
        await db.update(product_batch)
          .set({ quantity_remaining: batch.quantity_remaining - take })
          .where(and(eq(product_batch.id, batch.id), eq(product_batch.quantity_remaining, batch.quantity_remaining)))
        rows.push({
          sale_id: saleRow!.id, product_id: item.product_id, batch_id: batch.id,
          product_name: item.product_name, quantity: take, unit_price: String(item.unit_price),
          discount_percent: String(item.discount_percent),
          line_total: String(Number((take * item.unit_price * (1 - item.discount_percent / 100)).toFixed(2))),
        })
        meta.push({ base_unit: item.base_unit, product_strength: item.product_strength, controlled: item.is_controlled, batch_number: batch.batch_number })
        remaining -= take
      }

      // Out-of-stock tail — record without a batch so the sale still completes.
      if (remaining > 0) {
        rows.push({
          sale_id: saleRow!.id, product_id: item.product_id, batch_id: null,
          product_name: item.product_name, quantity: remaining, unit_price: String(item.unit_price),
          discount_percent: String(item.discount_percent),
          line_total: String(Number((remaining * item.unit_price * (1 - item.discount_percent / 100)).toFixed(2))),
        })
        meta.push({ base_unit: item.base_unit, product_strength: item.product_strength, controlled: false, batch_number: null })
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

    // Payment detail (cash/mpesa). 'split' lacks a breakdown in the POST body, so
    // we record only the sale totals for it.
    if (data.payment_method !== "split") {
      await db.insert(payment).values({
        sale_id: saleRow!.id, method: data.payment_method, amount: String(totalAmount),
        mpesa_receipt: data.mpesa_reference,
      })
    }

    // Echo the receipt-only fields the UI renders but the schema no longer stores.
    const items = inserted.map((row, idx) => ({
      ...row,
      selling_price: Number(row.unit_price), unit_price: Number(row.unit_price),
      line_total: Number(row.line_total), discount_percent: Number(row.discount_percent),
      base_unit: meta[idx]!.base_unit, product_strength: meta[idx]!.product_strength,
    }))
    const saleOut = {
      ...saleRow,
      subtotal: Number(saleRow!.subtotal), discount_amount: Number(saleRow!.discount_amount),
      tax_amount: Number(saleRow!.tax_amount), total_amount: Number(saleRow!.total_amount),
      amount_tendered: data.amount_tendered, change_given: data.change_given,
      mpesa_reference: data.mpesa_reference, customer_name: data.customer_name, customer_phone: data.customer_phone,
    }
    return { sale: saleOut, items }
  })

  return NextResponse.json(out, { status: 201 })
}
