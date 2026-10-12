import { z } from "zod"
import { zUuid } from "@/lib/api/validation"

// Items a device uploads, in the order they happened on the device.
const iso = z.string().datetime({ offset: true })
const money = z.number().nonnegative().max(10_000_000)

export const shiftOpenItem = z.object({
  type: z.literal("shift_open"),
  client_id: z.string().min(8).max(64),
  cashier_id: z.string().min(1),
  opened_at: iso,
  opening_float: money,
})

export const shiftCloseItem = z.object({
  type: z.literal("shift_close"),
  client_id: z.string().min(8).max(64), // the shift's client_id
  closed_at: iso,
  closing_cash: money.nullable(),
  notes: z.string().max(1000).nullable().optional(),
  closed_by: z.string().min(1).optional(), // set when a manager force-closed it on the device
})

export const saleLineItem = z.object({
  product_id: zUuid(),
  product_name: z.string().min(1).max(200),
  product_strength: z.string().max(100).nullable(),
  base_unit: z.string().max(40),
  quantity: z.number().int().positive(), // base units
  unit_price: money,                       // effective price per base unit actually charged
  discount_percent: z.number().min(0).max(100).default(0),
  line_total: money,
  is_controlled: z.boolean().default(false),
  sell_unit: z.object({ pack_size_id: zUuid(), unit_count: z.number().int().positive() }).nullable().optional(),
})

export const saleItem = z.object({
  type: z.literal("sale"),
  client_id: zUuid(),                      // = sale.offline_reference (idempotency key)
  receipt_number: z.string().regex(/^[A-Z0-9]{2,6}-\d{6}-\d{4,6}$/),
  cashier_id: z.string().min(1),
  shift_client_id: z.string().min(8).max(64).nullable(),
  sold_at: iso,
  items: z.array(saleLineItem).min(1).max(200),
  discount_amount: money.default(0),
  total_amount: money,
  payment_method: z.enum(["cash", "mpesa", "split"]),
  cash_amount: money.nullable().optional(),
  mpesa_amount: money.nullable().optional(),
  mpesa_reference: z.string().max(40).nullable().optional(),
  // false = recorded offline from a till/paybill code, not confirmed by STK.
  mpesa_verified: z.boolean().default(true),
  amount_tendered: money.nullable().optional(),
  change_given: money.nullable().optional(),
  customer_name: z.string().max(120).nullable().optional(),
  customer_phone: z.string().max(30).nullable().optional(),
  // Set when the sale happened under a manager's missed-sync override.
  override_client_id: z.string().max(64).nullable().optional(),
})

export const overrideItem = z.object({
  type: z.literal("override"),
  client_id: z.string().min(8).max(64),
  manager_id: z.string().min(1),
  at: iso,
  until: iso,
  pending_sales: z.number().int().nonnegative(),
})

export const pushItem = z.discriminatedUnion("type", [shiftOpenItem, shiftCloseItem, saleItem, overrideItem])
export const pushBody = z.object({
  items: z.array(z.unknown()).min(1).max(200),
  app_version: z.string().max(40).optional(),
})

export type PushItem = z.infer<typeof pushItem>
export type SaleItem = z.infer<typeof saleItem>

export type PushResult =
  | { client_id: string; status: "synced"; server_id: string; flags?: string[] }
  | { client_id: string; status: "duplicate"; server_id: string | null }
  | { client_id: string; status: "rejected"; code: string; message: string }
  | { client_id: string; status: "retry"; code: string; message: string }
