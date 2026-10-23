import { eq, sql } from "drizzle-orm"
import { dbAdmin, staff_profile } from "@pharmatrack/db"
import { rateLimit } from "@/lib/rate-limit"

// Records that someone used PharmaTrack today (operator insights, migration
// 040). One upsert per person per pharmacy per Nairobi day:
//  - a sign-in adds to `logins` (always counted),
//  - activity adds a "ping" — at most one per 5 minutes per person and app,
//    so pings ≈ the number of 5-minute stretches they were active.
// Best effort: never throws, never slows a request down on failure.

export type ActivitySource = "web" | "desktop" | "android"

const PING_WINDOW_SEC = 300

/** Guess the app from a request's user agent (used for sign-ins). */
export function sourceFromUserAgent(ua: string | null | undefined): ActivitySource {
  if (!ua) return "web"
  if (/okhttp|Expo|ReactNative|Dalvik/i.test(ua)) return "android"
  return "web"
}

async function orgFor(userId: string): Promise<string | null> {
  const [sp] = await dbAdmin().select({ org: staff_profile.organization_id }).from(staff_profile)
    .where(eq(staff_profile.user_id, userId)).limit(1)
  return sp?.org ?? null
}

export async function recordActivity(args: {
  userId: string
  organizationId?: string | null
  source: ActivitySource
  login?: boolean
}): Promise<void> {
  try {
    const login = args.login ? 1 : 0
    if (!login) {
      const r = await rateLimit(`act:${args.userId}:${args.source}`, 1, PING_WINDOW_SEC)
      if (!r.ok) return
    }
    // Platform operators and people without a pharmacy aren't tracked.
    const org = args.organizationId ?? (await orgFor(args.userId))
    if (!org) return
    await dbAdmin().execute(sql`
      INSERT INTO user_activity_day (user_id, organization_id, day, logins, pings, sources)
      VALUES (${args.userId}, ${org}, (now() AT TIME ZONE 'Africa/Nairobi')::date, ${login}, ${login ? 0 : 1}, ARRAY[${args.source}]::text[])
      ON CONFLICT (user_id, organization_id, day) DO UPDATE SET
        logins = user_activity_day.logins + EXCLUDED.logins,
        pings = user_activity_day.pings + EXCLUDED.pings,
        sources = ARRAY(SELECT DISTINCT unnest(user_activity_day.sources || EXCLUDED.sources)),
        last_seen_at = now()
    `)
  } catch (err) {
    console.warn("[insights] couldn't record activity", err)
  }
}
