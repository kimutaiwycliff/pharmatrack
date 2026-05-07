import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core"
import { branches } from "./branches"
import { products } from "./products"
import { product_batches } from "./product_batches"
import { sales } from "./sales"
import { profiles } from "./profiles"

export const controlled_substance_log = pgTable("controlled_substance_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id").notNull().references(() => branches.id),
  product_id: uuid("product_id").notNull().references(() => products.id),
  batch_id: uuid("batch_id").notNull().references(() => product_batches.id),

  transaction_type: text("transaction_type").notNull(),
  quantity: integer("quantity").notNull(),
  balance_after: integer("balance_after").notNull(),

  sale_id: uuid("sale_id").references(() => sales.id),
  patient_name: text("patient_name"),
  prescriber_name: text("prescriber_name"),
  prescription_number: text("prescription_number"),

  recorded_by: uuid("recorded_by").notNull().references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
