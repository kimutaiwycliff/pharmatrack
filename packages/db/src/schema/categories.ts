import { pgTable, uuid, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Self-referential: NULL = top-level category, set = subcategory (two-level taxonomy)
  parent_id: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
