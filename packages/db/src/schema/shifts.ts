import { pgTable, uuid, text, numeric, timestamp } from "drizzle-orm/pg-core"
import { branches } from "./branches"
import { profiles } from "./profiles"

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id").notNull().references(() => branches.id),
  staff_id: uuid("staff_id").notNull().references(() => profiles.id),
  clocked_in_at: timestamp("clocked_in_at", { withTimezone: true }).notNull(),
  clocked_out_at: timestamp("clocked_out_at", { withTimezone: true }),
  opening_float: numeric("opening_float", { precision: 12, scale: 2 }).notNull().default("0"),
  closing_cash: numeric("closing_cash", { precision: 12, scale: 2 }),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
