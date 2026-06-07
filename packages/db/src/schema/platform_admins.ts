import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core"

// auth.users id of a SaaS operator who can access the platform console.
export const platformAdmins = pgTable("platform_admins", {
  user_id: uuid("user_id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
