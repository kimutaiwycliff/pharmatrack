import { eq } from "drizzle-orm"
import { dbAdmin, platform_admin } from "@pharmatrack/db"
import { getSession } from "@/lib/auth/helpers"

/**
 * Resolve the current user and confirm they're a platform (SaaS operator) admin.
 * Returns the privileged Drizzle client for cross-tenant work, or null if the
 * caller isn't a platform admin.
 */
export async function getPlatformContext() {
  const session = await getSession()
  if (!session?.user) return null

  const db = dbAdmin()
  const [row] = await db.select().from(platform_admin).where(eq(platform_admin.user_id, session.user.id)).limit(1)
  if (!row) return null

  return { user: session.user, db }
}

export async function isPlatformAdmin(): Promise<boolean> {
  return (await getPlatformContext()) !== null
}
