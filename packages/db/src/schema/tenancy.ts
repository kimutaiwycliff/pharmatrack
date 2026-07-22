import { pgTable, uuid, text, boolean, numeric, integer, timestamp, date, jsonb } from "drizzle-orm/pg-core"
import { organization, user } from "./auth"

// Mirrors infra/migrations/003_org_structure.sql. organization_id is TEXT
// (FK to Better Auth organization.id). dbmate SQL is the DDL source of truth
// (incl. RLS); this schema is the typed query surface.

export const branch = pgTable("branch", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const staff_profile = pgTable("staff_profile", {
  user_id: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("cashier"),
  branch_id: uuid("branch_id").references(() => branch.id),
  phone: text("phone"),
  pin_hash: text("pin_hash"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const platform_admin = pgTable("platform_admin", {
  user_id: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const org_settings = pgTable("org_settings", {
  organization_id: text("organization_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  settings: jsonb("settings").notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const plan = pgTable("plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  price_kes: numeric("price_kes", { precision: 12, scale: 2 }).notNull().default("0"),
  interval: text("interval").notNull().default("monthly"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const subscription = pgTable("subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().unique().references(() => organization.id, { onDelete: "cascade" }),
  plan_id: uuid("plan_id").references(() => plan.id),
  status: text("status").notNull().default("trialing"),
  trial_ends_at: timestamp("trial_ends_at", { withTimezone: true }),
  current_period_end: timestamp("current_period_end", { withTimezone: true }),
  provider: text("provider"),
  provider_ref: text("provider_ref"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const subscription_payment = pgTable("subscription_payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  amount_kes: numeric("amount_kes", { precision: 12, scale: 2 }).notNull(),
  method: text("method"),
  reference: text("reference"),
  period_start: date("period_start"),
  period_end: date("period_end"),
  recorded_by: text("recorded_by").references(() => user.id),
  // 'pending' = owner self-reported a payment awaiting operator verification;
  // 'confirmed' = verified (operator-recorded rows default straight to this);
  // 'rejected' = operator could not verify the claim.
  status: text("status").notNull().default("confirmed"),
  claimed_by: text("claimed_by").references(() => user.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Soft-delete schedule (migration 017). One row per tenant pending deletion;
// a cron purges the org after scheduled_purge_at. Operator-only (RLS: no
// app_authenticated policy). Cancelling restores prev_subscription_status.
export const tenant_deletion = pgTable("tenant_deletion", {
  organization_id: text("organization_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  scheduled_purge_at: timestamp("scheduled_purge_at", { withTimezone: true }).notNull(),
  requested_at: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  requested_by: text("requested_by").references(() => user.id),
  prev_subscription_status: text("prev_subscription_status"),
  reason: text("reason"),
})

// Per-tenant M-Pesa Daraja config (migration 016). Secrets are stored ENCRYPTED
// (see apps/web/lib/crypto.ts) — never plaintext. STK push uses these creds so
// money lands in the tenant's own till; unset/inactive → manual-confirm only.
export const mpesa_config = pgTable("mpesa_config", {
  organization_id: text("organization_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  environment: text("environment").notNull().default("sandbox"), // sandbox | production
  shortcode: text("shortcode"),
  shortcode_type: text("shortcode_type").notNull().default("buygoods"), // buygoods | paybill
  consumer_key: text("consumer_key"),
  consumer_secret_enc: text("consumer_secret_enc"),
  passkey_enc: text("passkey_enc"),
  active: boolean("active").notNull().default(false),
  verified_at: timestamp("verified_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
