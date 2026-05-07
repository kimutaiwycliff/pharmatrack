import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core"

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  registration_number: text("registration_number"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  logo_url: text("logo_url"),
  settings: jsonb("settings").notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
