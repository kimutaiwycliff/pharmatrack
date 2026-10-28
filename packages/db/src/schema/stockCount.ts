import { pgTable, uuid, text, integer, numeric, timestamp, date, jsonb, boolean } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"
import { branch } from "./tenancy"
import { category, drug_catalog, product } from "./catalogue"
import { product_batch } from "./inventory"

// Mirrors infra/migrations/042_stock_take.sql (ADR-020).

export type StockCountKind = "count" | "setup"
export type StockCountStatus = "draft" | "review" | "posted" | "cancelled"

export const stock_count = pgTable("stock_count", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branch.id, { onDelete: "cascade" }),
  kind: text("kind").$type<StockCountKind>().notNull(),
  scope_category_id: uuid("scope_category_id").references(() => category.id, { onDelete: "set null" }),
  scope_key: text("scope_key"),
  title: text("title").notNull(),
  hide_expected: boolean("hide_expected").notNull().default(false),
  status: text("status").$type<StockCountStatus>().notNull().default("draft"),
  created_by: text("created_by").references(() => user.id, { onDelete: "set null" }),
  submitted_by: text("submitted_by").references(() => user.id, { onDelete: "set null" }),
  submitted_at: timestamp("submitted_at", { withTimezone: true }),
  posted_by: text("posted_by").references(() => user.id, { onDelete: "set null" }),
  posted_at: timestamp("posted_at", { withTimezone: true }),
  totals: jsonb("totals").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const stock_count_line = pgTable("stock_count_line", {
  id: uuid("id").primaryKey(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  count_id: uuid("count_id").notNull().references(() => stock_count.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").references(() => product.id, { onDelete: "cascade" }),
  catalog_id: uuid("catalog_id").references(() => drug_catalog.id),
  batch_id: uuid("batch_id").references(() => product_batch.id, { onDelete: "set null" }),
  batch_number: text("batch_number"),
  expiry_date: date("expiry_date"),
  barcode: text("barcode"),
  expected_qty: integer("expected_qty"),
  counted_qty: integer("counted_qty").notNull(),
  selling_price: numeric("selling_price", { precision: 12, scale: 2 }),
  cost_price: numeric("cost_price", { precision: 12, scale: 2 }),
  price_confirmed: boolean("price_confirmed").notNull().default(false),
  counted_by: text("counted_by").references(() => user.id, { onDelete: "set null" }),
  counted_at: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
  result: jsonb("result").$type<Record<string, unknown>>(),
})
