import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core"
import { organizations } from "./organizations"
import { plans } from "./plans"

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  plan_id: uuid("plan_id").references(() => plans.id),
  status: text("status").notNull().default("trialing"),
  trial_ends_at: timestamp("trial_ends_at", { withTimezone: true }),
  current_period_end: timestamp("current_period_end", { withTimezone: true }),
  provider: text("provider"),
  provider_customer_id: text("provider_customer_id"),
  provider_subscription_id: text("provider_subscription_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
