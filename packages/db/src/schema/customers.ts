import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"
import { profiles } from "./profiles"

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  full_name: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  reminders_opt_in: boolean("reminders_opt_in").notNull().default(true),
  created_by: uuid("created_by").references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
