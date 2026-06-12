import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"
import { branches } from "./branches"
import { products } from "./products"
import { product_batches } from "./product_batches"
import { profiles } from "./profiles"

export const stock_adjustments = pgTable("stock_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branches.id),
  product_id: uuid("product_id").notNull().references(() => products.id),
  batch_id: uuid("batch_id").notNull().references(() => product_batches.id),

  // Signed change applied to quantity_remaining (negative = reduction).
  delta: integer("delta").notNull(),
  quantity_before: integer("quantity_before").notNull(),
  quantity_after: integer("quantity_after").notNull(),

  reason: text("reason").notNull(),
  note: text("note"),

  adjusted_by: uuid("adjusted_by").notNull().references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
