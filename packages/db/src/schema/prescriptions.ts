import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"
import { customers } from "./customers"
import { profiles } from "./profiles"

export const prescriptions = pgTable("prescriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  customer_id: uuid("customer_id").notNull().references(() => customers.id),
  prescriber_name: text("prescriber_name"),
  prescriber_reg_no: text("prescriber_reg_no"),
  diagnosis: text("diagnosis"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  created_by: uuid("created_by").references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
