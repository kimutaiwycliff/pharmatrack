import { pgTable, uuid, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"
import { branch } from "./tenancy"
import { product, supplier } from "./catalogue"

// Mirrors infra/migrations/027_purchase_orders.sql. PO line quantities and
// costs are per PACK; receiving converts to base units for product_batch.

export const purchase_order = pgTable("purchase_order", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branch.id),
  supplier_id: uuid("supplier_id").references(() => supplier.id, { onDelete: "set null" }),
  po_number: text("po_number").notNull(),
  status: text("status").notNull().default("draft"),
  expected_date: date("expected_date"),
  notes: text("notes"),
  created_by: text("created_by").references(() => user.id, { onDelete: "set null" }),
  sent_at: timestamp("sent_at", { withTimezone: true }),
  received_at: timestamp("received_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const purchase_order_item = pgTable("purchase_order_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchase_order_id: uuid("purchase_order_id").notNull().references(() => purchase_order.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
  product_name: text("product_name").notNull(),
  product_strength: text("product_strength"),
  pack_label: text("pack_label"),
  units_per_pack: integer("units_per_pack").notNull().default(1),
  quantity_ordered: integer("quantity_ordered").notNull(),
  quantity_received: integer("quantity_received").notNull().default(0),
  unit_cost: numeric("unit_cost", { precision: 12, scale: 2 }),
  sort_order: integer("sort_order").notNull().default(0),
})
