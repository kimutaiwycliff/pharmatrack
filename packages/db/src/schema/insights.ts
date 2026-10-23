import { pgTable, uuid, text, integer, timestamp, date, primaryKey } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"

// Mirrors infra/migrations/040_platform_insights.sql. Operator-only tables
// (RLS: no app_authenticated policy) — read and written with dbAdmin only.

// One row per person per pharmacy per Nairobi day.
export const user_activity_day = pgTable("user_activity_day", {
  user_id: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  logins: integer("logins").notNull().default(0),
  pings: integer("pings").notNull().default(0),
  sources: text("sources").array().notNull().default([]),
  first_seen_at: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.user_id, t.organization_id, t.day] })])

// The operator's follow-up log per pharmacy.
export const platform_tenant_note = pgTable("platform_tenant_note", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  author_id: text("author_id").references(() => user.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("note"),
  body: text("body").notNull(),
  follow_up_on: date("follow_up_on"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
