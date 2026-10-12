import { eq } from "drizzle-orm"
import { db, sqlite } from "../db/database"
import { kvStore } from "../db/schema"

// Last-known-good cache for session/branch/shift context — see db/schema.ts's
// kvStore comment. Read on cold start as a fallback when the network fetch
// that would normally populate this data fails.
export async function kvGet<T>(key: string): Promise<T | null> {
  const rows = await db.select().from(kvStore).where(eq(kvStore.key, key)).limit(1)
  if (!rows[0]) return null
  try {
    return JSON.parse(rows[0].value) as T
  } catch {
    return null
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value)
  await db
    .insert(kvStore)
    .values({ key, value: json })
    .onConflictDoUpdate({ target: kvStore.key, set: { value: json } })
}

export async function kvDelete(key: string): Promise<void> {
  await db.delete(kvStore).where(eq(kvStore.key, key))
}

// Synchronous variants for the sync engine, which reads/writes its metadata
// inside (or right next to) sqlite.withTransactionSync() blocks.
export function kvGetSync<T>(key: string): T | null {
  const row = sqlite.getFirstSync<{ value: string }>("SELECT value FROM kv_store WHERE key = ?", [key])
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

export function kvSetSync(key: string, value: unknown): void {
  sqlite.runSync(
    "INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  )
}

export function kvDeleteSync(key: string): void {
  sqlite.runSync("DELETE FROM kv_store WHERE key = ?", [key])
}
