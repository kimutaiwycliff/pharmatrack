import { pgTable, uuid, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"
import { branch } from "./tenancy"
import { product, supplier } from "./catalogue"

// Mirrors the inventory section of infra/migrations/004_domain.sql.

export const product_batch = pgTable("product_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branch.id),
  supplier_id: uuid("supplier_id").references(() => supplier.id),
  batch_number: text("batch_number").notNull(),
  expiry_date: date("expiry_date").notNull(),
  quantity_received: integer("quantity_received").notNull(),
  quantity_remaining: integer("quantity_remaining").notNull(),
  cost_price: numeric("cost_price", { precision: 12, scale: 2 }),
  received_by: text("received_by").references(() => user.id),
  received_at: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
})

export const stock_adjustment = pgTable("stock_adjustment", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  batch_id: uuid("batch_id").notNull().references(() => product_batch.id),
  reason: text("reason").notNull(),
  delta: integer("delta").notNull(),
  quantity_before: integer("quantity_before").notNull(),
  quantity_after: integer("quantity_after").notNull(),
  note: text("note"),
  adjusted_by: text("adjusted_by").references(() => user.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const controlled_substance_log = pgTable("controlled_substance_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  sale_item_id: uuid("sale_item_id"),
  pharmacist_name: text("pharmacist_name"),
  pharmacist_reg: text("pharmacist_reg"),
  prescriber_name: text("prescriber_name"),
  prescriber_reg: text("prescriber_reg"),
  patient_id: text("patient_id"),
  quantity: integer("quantity").notNull(),
  batch_number: text("batch_number"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
