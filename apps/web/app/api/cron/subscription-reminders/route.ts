import { NextRequest, NextResponse } from "next/server"
import { inArray, eq } from "drizzle-orm"
import { dbAdmin, subscription, organization } from "@pharmatrack/db"
import { ownerContact, sendSubscriptionReminder } from "@/lib/notifications/billing"

// Sends a polite reminder email to a tenant's owner 7 days and again 1 day
// before their trial or subscription lapses. Secured by CRON_SECRET
// (`Authorization: Bearer <secret>`), same as the other /api/cron/* routes.
// Idempotent per renewal cycle: reminder_7d_sent_for/reminder_1d_sent_for
// store WHICH trial_ends_at/current_period_end instance a reminder was sent
// for, so a renewal (payment, plan change, operator edit) naturally makes a
// stale sent-for value stop matching and a fresh reminder becomes due next
// cycle — no need to explicitly reset these columns at every place a
// renewal date changes. Schedule roughly daily.
export const dynamic = "force-dynamic"

const DAY_MS = 86_400_000
const SEVEN_DAY_MS = 7 * DAY_MS
const ONE_DAY_MS = 1 * DAY_MS

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = dbAdmin()
  const rows = await db
    .select({
      organization_id: subscription.organization_id,
      org_name: organization.name,
      status: subscription.status,
      trial_ends_at: subscription.trial_ends_at,
      current_period_end: subscription.current_period_end,
      reminder_7d_sent_for: subscription.reminder_7d_sent_for,
      reminder_1d_sent_for: subscription.reminder_1d_sent_for,
    })
    .from(subscription)
    .innerJoin(organization, eq(organization.id, subscription.organization_id))
    .where(inArray(subscription.status, ["trialing", "active"]))

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")
  const billingUrl = `${appUrl}/settings`
  const now = Date.now()
  const sent: Array<{ organization_id: string; milestone: string }> = []

  for (const row of rows) {
    const isTrial = row.status === "trialing"
    const expiresAt = isTrial ? row.trial_ends_at : row.current_period_end
    if (!expiresAt) continue
    const msLeft = expiresAt.getTime() - now
    if (msLeft <= 0) continue // already lapsed — the expiry sweep handles status, not this route
    const daysLeft = Math.ceil(msLeft / DAY_MS)

    const milestones: Array<{ key: "7_day" | "1_day"; windowMs: number; sentFor: Date | null }> = [
      { key: "7_day", windowMs: SEVEN_DAY_MS, sentFor: row.reminder_7d_sent_for },
      { key: "1_day", windowMs: ONE_DAY_MS, sentFor: row.reminder_1d_sent_for },
    ]

    for (const m of milestones) {
      if (msLeft > m.windowMs) continue
      if (m.sentFor && m.sentFor.getTime() === expiresAt.getTime()) continue // already sent for this exact renewal date

      const contact = await ownerContact(row.organization_id)
      if (!contact) continue

      const result = await sendSubscriptionReminder(contact.email, {
        orgName: row.org_name,
        ownerName: contact.name,
        milestone: m.key,
        daysLeft,
        expiresAt,
        isTrial,
        billingUrl,
      })
      if (result.status !== "sent") continue

      await db
        .update(subscription)
        .set(m.key === "7_day" ? { reminder_7d_sent_for: expiresAt } : { reminder_1d_sent_for: expiresAt })
        .where(eq(subscription.organization_id, row.organization_id))

      sent.push({ organization_id: row.organization_id, milestone: m.key })
    }
  }

  return NextResponse.json({ ok: true, sent: sent.length, details: sent })
}
