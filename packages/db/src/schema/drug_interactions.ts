import { pgTable, uuid, text } from "drizzle-orm/pg-core"

// Reference data for basic Drug Utilization Review (interaction checks).
export const drugInteractions = pgTable("drug_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  drug_a: text("drug_a").notNull(),
  drug_b: text("drug_b").notNull(),
  severity: text("severity").notNull().default("moderate"),
  note: text("note"),
})
