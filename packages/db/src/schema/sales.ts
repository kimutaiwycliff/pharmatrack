import { pgTable, uuid, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"
import { branch } from "./tenancy"
import { product } from "./catalogue"
import { product_batch } from "./inventory"

// Mirrors the sales section of infra/migrations/004_domain.sql.

export const shift = pgTable("shift", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branch.id),
  cashier_id: text("cashier_id").notNull().references(() => user.id),
  opening_float: numeric("opening_float", { precision: 12, scale: 2 }).notNull().default("0"),
  closing_cash: numeric("closing_cash", { precision: 12, scale: 2 }),
  variance: numeric("variance", { precision: 12, scale: 2 }),
  notes: text("notes"),
  opened_at: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closed_at: timestamp("closed_at", { withTimezone: true }),
  // Offline sync (migration 029): the device that opened it + its client id.
  device_id: uuid("device_id"),
  client_id: text("client_id"),
})

export const sale = pgTable("sale", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branch.id),
  shift_id: uuid("shift_id").references(() => shift.id),
  cashier_id: text("cashier_id").references(() => user.id),
  receipt_number: text("receipt_number"),
  status: text("status").notNull().default("completed"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  discount_amount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  tax_amount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  payment_method: text("payment_method").notNull(),
  offline_reference: text("offline_reference").unique(),
  customer_id: uuid("customer_id"),
  amount_tendered: numeric("amount_tendered", { precision: 12, scale: 2 }),
  change_given: numeric("change_given", { precision: 12, scale: 2 }),
  customer_name: text("customer_name"),
  customer_phone: text("customer_phone"),
  // For device sales this is the real time of sale; synced_at = server receipt (migration 029).
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  device_id: uuid("device_id"),
  synced_at: timestamp("synced_at", { withTimezone: true }),
})

export const sale_item = pgTable("sale_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  sale_id: uuid("sale_id").notNull().references(() => sale.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").references(() => product.id),
  batch_id: uuid("batch_id").references(() => product_batch.id),
  product_name: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  discount_percent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  line_total: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  base_unit: text("base_unit"),
  product_strength: text("product_strength"),
  // Cost per base unit at sale time (migration 026) — survives product deletion.
  unit_cost: numeric("unit_cost", { precision: 12, scale: 2 }),
})

export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  sale_id: uuid("sale_id").notNull().references(() => sale.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  mpesa_checkout_id: text("mpesa_checkout_id"),
  mpesa_receipt: text("mpesa_receipt"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Every M-Pesa STK push the till sends (migration 045): confirmed by STK
// Query before it counts as paid, and tied to the one sale that used it.
export const mpesa_stk_request = pgTable("mpesa_stk_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  checkout_request_id: text("checkout_request_id").notNull().unique(),
  merchant_request_id: text("merchant_request_id"),
  phone: text("phone").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | cancelled | failed
  result_code: text("result_code"),
  result_desc: text("result_desc"),
  mpesa_receipt: text("mpesa_receipt"),
  sale_id: uuid("sale_id").references(() => sale.id, { onDelete: "set null" }),
  requested_by: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  last_checked_at: timestamp("last_checked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_mpesa_stk_request_org_created").on(t.organization_id, t.created_at)])
