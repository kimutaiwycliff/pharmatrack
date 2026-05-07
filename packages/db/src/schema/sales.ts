import { pgTable, uuid, text, numeric, timestamp } from "drizzle-orm/pg-core"
import { branches } from "./branches"
import { shifts } from "./shifts"
import { profiles } from "./profiles"

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id").notNull().references(() => branches.id),
  shift_id: uuid("shift_id").references(() => shifts.id),
  cashier_id: uuid("cashier_id").notNull().references(() => profiles.id),

  status: text("status").notNull().default("completed"),

  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  discount_amount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  tax_amount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),

  payment_method: text("payment_method").notNull(),
  amount_tendered: numeric("amount_tendered", { precision: 12, scale: 2 }),
  change_given: numeric("change_given", { precision: 12, scale: 2 }),
  mpesa_reference: text("mpesa_reference"),

  customer_name: text("customer_name"),
  customer_phone: text("customer_phone"),

  receipt_number: text("receipt_number").notNull().unique(),
  notes: text("notes"),
  voided_at: timestamp("voided_at", { withTimezone: true }),
  voided_by: uuid("voided_by").references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const sale_items = pgTable("sale_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sale_id: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").notNull(),
  batch_id: uuid("batch_id"),

  product_name: text("product_name").notNull(),
  product_strength: text("product_strength"),
  base_unit: text("base_unit").notNull(),

  quantity: numeric("quantity", { precision: 12, scale: 0 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  discount_percent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  line_total: numeric("line_total", { precision: 12, scale: 2 }).notNull(),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
