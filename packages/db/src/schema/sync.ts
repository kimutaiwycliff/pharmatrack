import { pgTable, uuid, text, integer, numeric, timestamp, jsonb, bigserial, primaryKey } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"
import { branch } from "./tenancy"
import { product } from "./catalogue"

// Mirrors infra/migrations/029_offline_sync.sql (offline-first mobile sync)
// and 041_device_lock.sql (device purpose + approval requests).

export const device = pgTable("device", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branch.id),
  name: text("name").notNull(),
  device_code: text("device_code").notNull(),
  token_hash: text("token_hash").notNull(),
  platform: text("platform"),
  app_version: text("app_version"),
  allocation_percent: numeric("allocation_percent", { precision: 5, scale: 2 }),
  registered_by: text("registered_by").references(() => user.id, { onDelete: "set null" }),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }),
  last_sync_at: timestamp("last_sync_at", { withTimezone: true }),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // 'till' sells (stock share, offline sync) · 'office' = sign-in only (ADR-018, migration 041)
  purpose: text("purpose").notNull().default("till"),
  // Migration 043: a temporary approval's end (null = until removed).
  approved_until: timestamp("approved_until", { withTimezone: true }),
  // Migration 043: all | selling | back_office — limits the person's role on this device.
  access: text("access").notNull().default("all"),
})

// A blocked sign-in asking for this device to be approved (ADR-018,
// migration 041). secret_hash becomes the device's token_hash on approval.
export const device_request = pgTable("device_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  user_id: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").references(() => branch.id, { onDelete: "set null" }),
  suggested_name: text("suggested_name").notNull(),
  platform: text("platform"),
  user_agent: text("user_agent"),
  ip_address: text("ip_address"),
  code: text("code").notNull(),
  secret_hash: text("secret_hash").notNull(),
  status: text("status").notNull().default("pending"),
  device_id: uuid("device_id").references(() => device.id, { onDelete: "set null" }),
  decided_by: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decided_via: text("decided_via"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  decided_at: timestamp("decided_at", { withTimezone: true }),
})

export const device_stock_allocation = pgTable("device_stock_allocation", {
  device_id: uuid("device_id").notNull().references(() => device.id, { onDelete: "cascade" }),
  product_id: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  reserved_until: timestamp("reserved_until", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.device_id, t.product_id] })])

export const sync_issue = pgTable("sync_issue", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id").notNull().references(() => branch.id),
  device_id: uuid("device_id").references(() => device.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  sale_id: uuid("sale_id"),
  shift_id: uuid("shift_id"),
  product_id: uuid("product_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("open"),
  resolved_by: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  resolved_at: timestamp("resolved_at", { withTimezone: true }),
  resolution_note: text("resolution_note"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const sync_tombstone = pgTable("sync_tombstone", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  organization_id: text("organization_id").notNull(),
  entity: text("entity").notNull(),
  entity_id: text("entity_id").notNull(),
  deleted_at: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
})
