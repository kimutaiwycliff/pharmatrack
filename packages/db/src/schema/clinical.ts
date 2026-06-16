import { pgTable, uuid, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"
import { branch } from "./tenancy"
import { product } from "./catalogue"
import { sale } from "./sales"

// Mirrors the clinical section of infra/migrations/004_domain.sql + 006 enrichment.

export const customer = pgTable("customer", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  full_name: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  date_of_birth: date("date_of_birth"),
  sex: text("sex"),
  allergies: text("allergies"),
  notes: text("notes"),
  reminders_opt_in: boolean("reminders_opt_in").notNull().default(true),
  created_by: text("created_by").references(() => user.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const appointment_service = pgTable("appointment_service", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  recurrence_weeks: integer("recurrence_weeks"),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
})

export const appointment = pgTable("appointment", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").references(() => branch.id),
  customer_id: uuid("customer_id").notNull().references(() => customer.id),
  service_id: uuid("service_id").references(() => appointment_service.id),
  service: text("service"),
  service_label: text("service_label"),
  scheduled_at: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  duration_minutes: integer("duration_minutes").notNull().default(15),
  status: text("status").notNull().default("scheduled"),
  assigned_to: text("assigned_to").references(() => user.id),
  notes: text("notes"),
  parent_appointment_id: uuid("parent_appointment_id"),
  next_due_date: date("next_due_date"),
  created_by: text("created_by").references(() => user.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const appointment_reminder = pgTable("appointment_reminder", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  appointment_id: uuid("appointment_id").notNull().references(() => appointment.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  recipient: text("recipient"),
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
  prescriber_name: text("prescriber_name"),
  prescriber_reg_no: text("prescriber_reg_no"),
  diagnosis: text("diagnosis"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  sale_id: uuid("sale_id").references(() => sale.id),
  created_by: text("created_by").references(() => user.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const prescription_item = pgTable("prescription_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  prescription_id: uuid("prescription_id").notNull().references(() => prescription.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").references(() => product.id),
  drug: text("drug"),
  drug_name: text("drug_name"),
  strength: text("strength"),
  dose: text("dose"),
  quantity: integer("quantity"),
  frequency: text("frequency"),
  duration: text("duration"),
  instructions: text("instructions"),
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
