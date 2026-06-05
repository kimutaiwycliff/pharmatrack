import { pgTable, uuid, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"
import { categories } from "./categories"
import { profiles } from "./profiles"
import { suppliers } from "./suppliers"

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  category_id: uuid("category_id").references(() => categories.id),
  supplier_id: uuid("supplier_id").references(() => suppliers.id),

  // Identity
  name: text("name").notNull(),
  brand_name: text("brand_name"),
  manufacturer: text("manufacturer"),
  gtin: text("gtin"),
  barcode_raw: text("barcode_raw"),

  // Pharmaceutical details
  strength: text("strength"),
  dosage_form: text("dosage_form"),

  // Unit of measure
  base_unit: text("base_unit").notNull(),
  pack_label: text("pack_label"),
  units_per_pack: integer("units_per_pack").notNull().default(1),

  // Pricing
  cost_price: numeric("cost_price", { precision: 12, scale: 2 }),
  selling_price: numeric("selling_price", { precision: 12, scale: 2 }).notNull(),

  // Inventory control
  reorder_level: integer("reorder_level").notNull().default(10),
  reorder_quantity: integer("reorder_quantity").notNull().default(100),

  // Regulatory
  is_controlled: boolean("is_controlled").notNull().default(false),
  requires_prescription: boolean("requires_prescription").notNull().default(false),

  // Metadata
  is_active: boolean("is_active").notNull().default(true),
  created_by: uuid("created_by").references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
