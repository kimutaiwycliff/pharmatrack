import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
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

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError("Unauthorized", 401)

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role, branch_id")
    .eq("id", user.id)
    .single()

  if (!profile) return apiError("Profile not found", 404)

  const body = (await request.json()) as unknown
  const parsed = saleSchema.safeParse(body)
  if (!parsed.success) return zodErrorResponse(parsed.error)

  const data = parsed.data
  const subtotal = data.items.reduce((s, i) => s + i.line_total, 0)
  const totalAmount = Math.max(0, subtotal - data.discount_amount)

  // Generate receipt number via PostgreSQL function
  const { data: receiptData, error: receiptErr } = await supabase.rpc(
    "generate_receipt_number",
    { p_branch_id: data.branch_id },
  )
  if (receiptErr) return apiError(receiptErr.message, 500)

  const receiptNumber = receiptData as string

  // Insert sale record
  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .insert({
      branch_id: data.branch_id,
      cashier_id: user.id,
      shift_id: data.shift_id,
      receipt_number: receiptNumber,
      payment_method: data.payment_method,
      status: "completed",
      subtotal,
      discount_amount: data.discount_amount,
      tax_amount: 0,
      total_amount: totalAmount,
      amount_tendered: data.amount_tendered,
      change_given: data.change_given,
      mpesa_reference: data.mpesa_reference,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
    })
    .select()
    .single()

  if (saleErr) return apiError(saleErr.message, 500)

  const saleItemsToInsert: Array<{
    sale_id: string
    product_id: string
    batch_id: string | null
    product_name: string
    product_strength: string | null
    base_unit: string
    quantity: number
    unit_price: number
    discount_percent: number
    line_total: number
  }> = []

  // FEFO batch deduction for each cart item
  for (const item of data.items) {
    const { data: batches } = await supabase
      .from("product_batches")
      .select("id, quantity_remaining")
      .eq("product_id", item.product_id)
      .eq("branch_id", data.branch_id)
      .gt("quantity_remaining", 0)
      .order("expiry_date", { ascending: true })

    let remaining = item.quantity

    for (const batch of batches ?? []) {
      if (remaining <= 0) break
      const take = Math.min(remaining, batch.quantity_remaining)

      // Optimistic decrement — eq on current qty acts as a guard against concurrent sales
      await supabase
        .from("product_batches")
        .update({ quantity_remaining: batch.quantity_remaining - take })
        .eq("id", batch.id)
        .eq("quantity_remaining", batch.quantity_remaining)

      saleItemsToInsert.push({
        sale_id: sale.id,
        product_id: item.product_id,
        batch_id: batch.id,
        product_name: item.product_name,
        product_strength: item.product_strength,
        base_unit: item.base_unit,
        quantity: take,
        unit_price: item.unit_price,
        discount_percent: item.discount_percent,
        line_total: Number((take * item.unit_price * (1 - item.discount_percent / 100)).toFixed(2)),
      })

      remaining -= take
    }

    // Out-of-stock tail — record without a batch so the sale still completes
    if (remaining > 0) {
      saleItemsToInsert.push({
        sale_id: sale.id,
        product_id: item.product_id,
        batch_id: null,
        product_name: item.product_name,
        product_strength: item.product_strength,
        base_unit: item.base_unit,
        quantity: remaining,
        unit_price: item.unit_price,
        discount_percent: item.discount_percent,
        line_total: Number((remaining * item.unit_price * (1 - item.discount_percent / 100)).toFixed(2)),
      })
    }

    // Controlled substance register entry (requires a batch)
    if (item.is_controlled) {
      const firstBatchId = batches?.[0]?.id
      if (firstBatchId) {
        await supabase.from("controlled_substance_log").insert({
          branch_id: data.branch_id,
          product_id: item.product_id,
          batch_id: firstBatchId,
          sale_id: sale.id,
          transaction_type: "sale",
          quantity: item.quantity,
          balance_after: 0,
          recorded_by: user.id,
        })
      }
    }
  }

  const { data: insertedItems, error: itemsErr } = await supabase
    .from("sale_items")
    .insert(saleItemsToInsert)
    .select()

  if (itemsErr) return apiError(itemsErr.message, 500)

  return NextResponse.json({ sale, items: insertedItems }, { status: 201 })
}
