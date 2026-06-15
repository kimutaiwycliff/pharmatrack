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

/**
 * Run `fn` inside a transaction bound to one tenant. Sets the
 * `app.organization_id` GUC that RLS policies read via
 * `current_setting('app.organization_id', true)`. The connection authenticates
 * as `app_authenticated`, so RLS is enforced — deny by default.
 */
export async function withTenant<T>(
  organizationId: string,
  fn: (db: DrizzleDB) => Promise<T>,
): Promise<T> {
  return dbAuthenticated().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.organization_id', ${organizationId}, true)`,
    )
    return fn(tx as unknown as DrizzleDB)
  })
}
