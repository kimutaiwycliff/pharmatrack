import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core"
import { organization } from "./auth"
import { sale } from "./sales"

// Mirrors the clinical section of infra/migrations/004_domain.sql.

export const customer = pgTable("customer", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  full_name: text("full_name").notNull(),
  phone: text("phone"),
  allergies: text("allergies"),
  reminder_opt_in: boolean("reminder_opt_in").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const appointment_service = pgTable("appointment_service", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  recurrence_weeks: integer("recurrence_weeks"),
  sort_order: integer("sort_order").notNull().default(0),
})

export const appointment = pgTable("appointment", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  customer_id: uuid("customer_id").notNull().references(() => customer.id),
  service_id: uuid("service_id").references(() => appointment_service.id),
  scheduled_at: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const appointment_reminder = pgTable("appointment_reminder", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  appointment_id: uuid("appointment_id").notNull().references(() => appointment.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("pending"),
  send_at: timestamp("send_at", { withTimezone: true }).notNull(),
  sent_at: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
})

export const prescription = pgTable("prescription", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  customer_id: uuid("customer_id").references(() => customer.id),
  prescriber: text("prescriber"),
  sale_id: uuid("sale_id").references(() => sale.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const prescription_item = pgTable("prescription_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  prescription_id: uuid("prescription_id").notNull().references(() => prescription.id, { onDelete: "cascade" }),
  drug: text("drug").notNull(),
  strength: text("strength"),
  quantity: integer("quantity"),
  frequency: text("frequency"),
})

export const audit_log = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  actor_id: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entity_id: text("entity_id"),
  diff: text("diff"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
