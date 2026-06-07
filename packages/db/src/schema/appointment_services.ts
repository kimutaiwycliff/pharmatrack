import { pgTable, uuid, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"

export const appointmentServices = pgTable("appointment_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  recurrence_weeks: integer("recurrence_weeks"),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgSlug: unique().on(t.organization_id, t.slug),
}))
