import { pgTable, uuid, text, boolean, integer, timestamp } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"

// Mirrors infra/migrations/030_trial_grant.sql.

// Every trial decision (granted or refused) keyed by canonical identity signals.
// organization_id is intentionally NOT a foreign key so the history survives a
// tenant purge. Operator-only (RLS: no app_authenticated policy) — dbAdmin only.
export const trial_grant = pgTable("trial_grant", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id"),
  email_canonical: text("email_canonical").notNull(),
  email_raw: text("email_raw"),
  google_account_id: text("google_account_id"),
  phone_e164: text("phone_e164"),
  registration_number_canonical: text("registration_number_canonical"),
  signup_ip: text("signup_ip"),
  user_agent: text("user_agent"),
  source: text("source").$type<"signup" | "google" | "operator" | "backfill">().notNull(),
  trial_days: integer("trial_days").notNull().default(0),
  granted: boolean("granted").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Owner asks the operator for a trial (or a longer one). Org-scoped (RLS:
// tenants read + insert pending rows for their own org; operator decides).
export const trial_extension_request = pgTable("trial_extension_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  user_id: text("user_id").references(() => user.id, { onDelete: "set null" }),
  message: text("message"),
  status: text("status").$type<"pending" | "approved" | "declined">().notNull().default("pending"),
  days_granted: integer("days_granted"),
  decided_by: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decided_at: timestamp("decided_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
