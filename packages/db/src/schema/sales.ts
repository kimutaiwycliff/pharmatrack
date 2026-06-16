import { pgTable, uuid, text, integer, numeric, timestamp } from "drizzle-orm/pg-core"
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
  opened_at: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closed_at: timestamp("closed_at", { withTimezone: true }),
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
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
