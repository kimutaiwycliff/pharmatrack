import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core"
import { prescriptions } from "./prescriptions"
import { products } from "./products"

export const prescriptionItems = pgTable("prescription_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  prescription_id: uuid("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").references(() => products.id),
  drug_name: text("drug_name").notNull(),
  dose: text("dose"),
  frequency: text("frequency"),
  duration: text("duration"),
  quantity: integer("quantity"),
  instructions: text("instructions"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
