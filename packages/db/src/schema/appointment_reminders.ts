import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"
import { appointments } from "./appointments"

export const appointmentReminders = pgTable("appointment_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointment_id: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),

  channel: text("channel").notNull(),     // 'sms' | 'email'
  recipient: text("recipient").notNull(), // 'customer' | 'pharmacist'
  send_at: timestamp("send_at", { withTimezone: true }).notNull(),

  status: text("status").notNull().default("pending"),
  sent_at: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
