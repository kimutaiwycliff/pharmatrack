import { pgTable, uuid, text, numeric, boolean, jsonb, timestamp } from "drizzle-orm/pg-core"

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  price_kes: numeric("price_kes", { precision: 12, scale: 2 }).notNull().default("0"),
  interval: text("interval").notNull().default("monthly"),
  limits: jsonb("limits").notNull().default({}),
  features: jsonb("features").notNull().default({}),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
