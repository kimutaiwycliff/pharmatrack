import { NextRequest, NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { audit_log, dbAdmin } from "@pharmatrack/db"
import { buildOverview } from "@/lib/insights/overview"
import { digestEmail, isDigestTime, isoWeekKey } from "@/lib/insights/digest"
import { sendPlatformDigest } from "@/lib/notifications/platform"

// Weekly operator digest: Monday from 07:00 Nairobi, once per ISO week, to
// PLATFORM_NOTIFY_EMAIL (or every platform admin) — which pharmacies to call,
// trials ending, planned follow-ups, and the platform's month in numbers.
// Called hourly by the worker; secured by CRON_SECRET like the other crons.
// ?force=1 sends a preview now without marking the week as sent.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const force = request.nextUrl.searchParams.get("force") === "1"
  const now = Date.now()
  const week = isoWeekKey(now)
  if (!force && !isDigestTime(now)) return NextResponse.json({ status: "not_due", week })

  const db = dbAdmin()
  if (!force) {
    const [sent] = await db.select({ id: audit_log.id }).from(audit_log)
      .where(and(eq(audit_log.action, "platform.digest"), sql`${audit_log.diff}->>'week' = ${week}`)).limit(1)
    if (sent) return NextResponse.json({ status: "already_sent", week })
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "https://pharmatrack.co.ke").replace(/\/$/, "")
  const overview = await buildOverview()
  const { subject, html, sections } = digestEmail(overview, appUrl, now)
  const delivered = await sendPlatformDigest(force ? `[Preview] ${subject}` : subject, html)

  if (!force && delivered > 0) {
    await db.insert(audit_log).values({
      organization_id: null, actor_id: null, action: "platform.digest", entity: "platform",
      diff: { week, attention: sections.attention.length, trials_ending: sections.trialsEnding.length, follow_ups: sections.followUps.length },
    })
  }
  return NextResponse.json({ status: delivered > 0 ? "sent" : "not_delivered", week, delivered, attention: sections.attention.length })
}
