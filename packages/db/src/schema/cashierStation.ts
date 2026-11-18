import { pgTable, uuid, text, integer, numeric, timestamp, date, boolean, primaryKey, index, unique } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"
import { branch } from "./tenancy"
import { product, product_pack_size } from "./catalogue"
import { sale } from "./sales"

// Mirrors infra/migrations/046_cashier_station.sql (ADR-021).

export type OrgAddonStatus = "requested" | "active" | "cancelled"
export type CounterOrderStatus = "awaiting_payment" | "paid" | "cancelled" | "expired"

export const addon = pgTable("addon", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  price_kes_month: numeric("price_kes_month", { precision: 12, scale: 2 }).notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const org_addon = pgTable("org_addon", {
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  addon_code: text("addon_code").notNull().references(() => addon.code),
  status: text("status").$type<OrgAddonStatus>().notNull().default("active"),
  activated_at: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
  granted_by: text("granted_by"),
  // Migration 047: operator-confirmed payments (Nairobi day, inclusive; null = no end).
  paid_until: date("paid_until"),
  requested_at: timestamp("requested_at", { withTimezone: true }),
  requested_by: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  request_note: text("request_note"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.organization_id, t.addon_code] })])

export const counter_order = pgTable("counter_order", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branch.id, { onDelete: "cascade" }),
  business_date: date("business_date").notNull(),
  number: integer("number").notNull(),
  status: text("status").$type<CounterOrderStatus>().notNull().default("awaiting_payment"),
  sent_by: text("sent_by").references(() => user.id, { onDelete: "set null" }),
  collected_by: text("collected_by").references(() => user.id, { onDelete: "set null" }),
  cancelled_by: text("cancelled_by").references(() => user.id, { onDelete: "set null" }),
  sale_id: uuid("sale_id").references(() => sale.id, { onDelete: "set null" }),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  discount_amount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  customer_name: text("customer_name"),
  customer_phone: text("customer_phone"),
  client_reference: text("client_reference").unique(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.branch_id, t.business_date, t.number),
  index("idx_counter_order_queue").on(t.branch_id, t.status, t.expires_at),
])

export const counter_order_item = pgTable("counter_order_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id").notNull().references(() => counter_order.id, { onDelete: "cascade" }),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
  product_name: text("product_name").notNull(),
  product_strength: text("product_strength"),
  base_unit: text("base_unit").notNull(),
  is_controlled: boolean("is_controlled").notNull().default(false),
  quantity: integer("quantity").notNull(),
  pack_size_id: uuid("pack_size_id").references(() => product_pack_size.id, { onDelete: "set null" }),
  unit_count: integer("unit_count"),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  discount_percent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  line_total: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  removed_at: timestamp("removed_at", { withTimezone: true }),
  removed_by: text("removed_by").references(() => user.id, { onDelete: "set null" }),
}, (t) => [
  index("idx_counter_order_item_order").on(t.order_id),
  index("idx_counter_order_item_product").on(t.product_id),
])
