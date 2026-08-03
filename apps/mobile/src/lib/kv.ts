import { eq } from "drizzle-orm"
import { db } from "../db/database"
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
