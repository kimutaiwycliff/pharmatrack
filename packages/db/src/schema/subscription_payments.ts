import { pgTable, uuid, text, numeric, date, timestamp } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"
import { profiles } from "./profiles"

export const subscriptionPayments = pgTable("subscription_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  amount_kes: numeric("amount_kes", { precision: 12, scale: 2 }).notNull(),
  method: text("method"),
  period_start: date("period_start"),
  period_end: date("period_end"),
  reference: text("reference"),
  recorded_by: uuid("recorded_by").references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
