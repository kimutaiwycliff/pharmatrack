import { pgTable, uuid, text, boolean, numeric, integer, timestamp, unique } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"

// Mirrors the catalogue section of infra/migrations/004_domain.sql.

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  parent_id: uuid("parent_id"),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const supplier = pgTable("supplier", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const drug_catalog = pgTable("drug_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  brand_name: text("brand_name"),
  manufacturer: text("manufacturer"),
  gtin: text("gtin"),
  strength: text("strength"),
  dosage_form: text("dosage_form"),
  base_unit: text("base_unit").notNull().default("tablet"),
  is_controlled: boolean("is_controlled").notNull().default(false),
  requires_prescription: boolean("requires_prescription").notNull().default(false),
  // Onboarding enrichment (migration 009): department + reference pricing/pack.
  // default_*_price are PER BASE UNIT (matches POS line pricing).
  category: text("category"),
  subcategory: text("subcategory"),
  is_otc: boolean("is_otc").notNull().default(false),
  therapeutic_class: text("therapeutic_class"),
  default_pack_label: text("default_pack_label"),
  default_units_per_pack: integer("default_units_per_pack").notNull().default(1),
  default_cost_price: numeric("default_cost_price", { precision: 12, scale: 2 }),
  default_selling_price: numeric("default_selling_price", { precision: 12, scale: 2 }),
  image_url: text("image_url"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uq: unique("uq_drug_catalog").on(t.name, t.strength, t.dosage_form).nullsNotDistinct() }))

export const drug_interaction = pgTable("drug_interaction", {
  id: uuid("id").primaryKey().defaultRandom(),
  drug_a: text("drug_a").notNull(),
  drug_b: text("drug_b").notNull(),
  severity: text("severity").notNull(),
  note: text("note"),
})

export const product = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  catalog_id: uuid("catalog_id").references(() => drug_catalog.id),
  category_id: uuid("category_id").references(() => category.id),
  supplier_id: uuid("supplier_id").references(() => supplier.id),
  name: text("name").notNull(),
  brand_name: text("brand_name"),
  manufacturer: text("manufacturer"),
  gtin: text("gtin"),
  barcode_raw: text("barcode_raw"),
  strength: text("strength"),
  dosage_form: text("dosage_form"),
  base_unit: text("base_unit").notNull().default("unit"),
  pack_label: text("pack_label"),
  units_per_pack: integer("units_per_pack").notNull().default(1),
  cost_price: numeric("cost_price", { precision: 12, scale: 2 }),
  selling_price: numeric("selling_price", { precision: 12, scale: 2 }).notNull().default("0"),
  reorder_level: integer("reorder_level").notNull().default(10),
  max_discount_percent: numeric("max_discount_percent", { precision: 5, scale: 2 }),
  is_controlled: boolean("is_controlled").notNull().default(false),
  requires_prescription: boolean("requires_prescription").notNull().default(false),
  image_url: text("image_url"),
  is_active: boolean("is_active").notNull().default(true),
  created_by: text("created_by").references(() => user.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const product_pack_size = pgTable("product_pack_size", {
  id: uuid("id").primaryKey().defaultRandom(),
  product_id: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  unit_count: integer("unit_count").notNull().default(1),
  selling_price: numeric("selling_price", { precision: 12, scale: 2 }).notNull(),
  cost_price: numeric("cost_price", { precision: 12, scale: 2 }),
})
