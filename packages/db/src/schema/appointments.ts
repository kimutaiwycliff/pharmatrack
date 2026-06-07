import { pgTable, uuid, text, integer, date, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"
import { branches } from "./branches"
import { profiles } from "./profiles"
import { customers } from "./customers"

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branches.id),
  customer_id: uuid("customer_id").notNull().references(() => customers.id),

  service: text("service").notNull(),
  scheduled_at: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  duration_minutes: integer("duration_minutes").notNull().default(15),
  assigned_to: uuid("assigned_to").references(() => profiles.id),

  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),

  next_due_date: date("next_due_date"),
  parent_appointment_id: uuid("parent_appointment_id").references((): AnyPgColumn => appointments.id),

  created_by: uuid("created_by").references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
