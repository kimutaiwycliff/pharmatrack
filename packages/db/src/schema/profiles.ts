import { pgTable, uuid, text, boolean, timestamp, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organizations } from "./organizations"
import { branches } from "./branches"

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),  // matches auth.users.id
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").references(() => branches.id),
  full_name: text("full_name").notNull(),
  phone: text("phone"),
  role: text("role").notNull(),
  pin_hash: text("pin_hash"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("role_check", sql`${t.role} IN ('owner','manager','pharmacist','cashier')`),
])
