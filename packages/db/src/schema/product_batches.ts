import { pgTable, uuid, text, numeric, integer, date, timestamp } from "drizzle-orm/pg-core"
import { products } from "./products"
import { branches } from "./branches"
import { suppliers } from "./suppliers"
import { profiles } from "./profiles"

export const product_batches = pgTable("product_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  product_id: uuid("product_id").notNull().references(() => products.id),
  branch_id: uuid("branch_id").notNull().references(() => branches.id),
  supplier_id: uuid("supplier_id").references(() => suppliers.id),

  batch_number: text("batch_number").notNull(),
  expiry_date: date("expiry_date").notNull(),
  manufactured_date: date("manufactured_date"),

  quantity_received: integer("quantity_received").notNull(),
  quantity_remaining: integer("quantity_remaining").notNull(),
  cost_price: numeric("cost_price", { precision: 12, scale: 2 }),

  received_at: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  received_by: uuid("received_by").references(() => profiles.id),
  purchase_order_id: uuid("purchase_order_id"),

  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
