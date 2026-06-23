import postgres from "postgres"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"
import * as schema from "./schema"

// ── Two-role connection model (see CLAUDE.md §5 / ADR-001) ──────────────────
//   DATABASE_URL                → app_owner role: migrations, seed, platform/
//                                  service queries (bypasses RLS).
//   DATABASE_AUTHENTICATED_URL  → app_authenticated role: all tenant traffic,
//                                  subject to RLS. Use ONLY via withTenant().
//
// Clients are created lazily so importing this module never connects (and never
// throws at build time when env is absent).

export type DrizzleDB = PostgresJsDatabase<typeof schema>

let _admin: DrizzleDB | null = null
let _authed: DrizzleDB | null = null

function makeClient(url: string | undefined, label: string): DrizzleDB {
  if (!url) throw new Error(`${label} is not set`)
  const client = postgres(url, { max: 10, prepare: false })
  return drizzle(client, { schema })
}

/** Privileged client (app_owner) — platform/service work that legitimately
 *  bypasses RLS. Never use this for tenant-scoped reads/writes. */
export function dbAdmin(): DrizzleDB {
  return (_admin ??= makeClient(process.env.DATABASE_URL, "DATABASE_URL"))
}

function dbAuthenticated(): DrizzleDB {
  return (_authed ??= makeClient(
    process.env.DATABASE_AUTHENTICATED_URL ?? process.env.DATABASE_URL,
    "DATABASE_AUTHENTICATED_URL",
  ))
}

// Sentinel branch for a branch-locked user with no assigned branch: a valid UUID
// that matches no real row, so the session sees nothing (fail-closed) instead of
// silently falling back to org-wide.
const NO_BRANCH = "00000000-0000-0000-0000-000000000000"

// Roles pinned to a single branch at the DB layer. owner/manager are org-wide
// (they get the branch switcher in the UI); everyone else is locked to their
// assigned branch. Keep in sync with the branch switcher gate in the web app.
const BRANCH_LOCKED_ROLES = new Set(["cashier", "pharmacist"])

/** Minimal tenant context withTenant needs. Structurally matches the web app's
 *  TenantContext / getApiContext() return, so routes can pass `ctx` directly. */
export interface TenantArg {
  organizationId: string
  role?: string | null
  branchId?: string | null
}

/**
 * Run `fn` inside a transaction bound to one tenant. Sets the request GUCs the
 * RLS helpers read (`current_setting('app.<x>', true)`):
 *   - app.organization_id  — tenant isolation (deny by default; see ADR-001)
 *   - app.role             — drives role-gated write policies (branch/staff/org_settings)
 *   - app.branch_id        — branch isolation: set ONLY for branch-locked roles
 *                            (cashier/pharmacist). When set, branch-scoped tables
 *                            (sale, shift, product_batch, …) are pinned to it.
 * The connection authenticates as `app_authenticated`, so RLS is enforced.
 *
 * Pass a TenantArg (the route's `ctx`) to enable role + branch scoping, or a bare
 * org id string for trusted org-wide service/admin work (no branch lock).
 */
export async function withTenant<T>(
  arg: string | TenantArg,
  fn: (db: DrizzleDB) => Promise<T>,
): Promise<T> {
  const organizationId = typeof arg === "string" ? arg : arg.organizationId
  const role = typeof arg === "string" ? null : arg.role ?? null
  // Branch-locked roles always pin a branch (their own, or NO_BRANCH when
  // unassigned → fail-closed). All other roles run org-wide (no app.branch_id).
  const branchId =
    role != null && BRANCH_LOCKED_ROLES.has(role)
      ? (typeof arg === "string" ? null : arg.branchId) || NO_BRANCH
      : null

  return dbAuthenticated().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`)
    if (role) await tx.execute(sql`select set_config('app.role', ${role}, true)`)
    if (branchId) await tx.execute(sql`select set_config('app.branch_id', ${branchId}, true)`)
    return fn(tx as unknown as DrizzleDB)
  })
}
