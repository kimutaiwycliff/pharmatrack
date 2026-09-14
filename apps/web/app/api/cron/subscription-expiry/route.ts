import { NextRequest, NextResponse } from "next/server"
import { inArray, eq } from "drizzle-orm"
import { dbAdmin, subscription } from "@pharmatrack/db"
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-status"

// Persists the EFFECTIVE subscription status (trial/period expiry, dunning
// grace) so the operator console and BillingPanel reflect reality. Actual
// access is already enforced in real time by effectiveSubscriptionStatus() in
// loadAppShell — this sweep just keeps the stored column from drifting forever
// stale for tenants nobody reopens the app for. Secured by CRON_SECRET
// (`Authorization: Bearer <secret>`). Idempotent. Schedule every few hours.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = dbAdmin()
  const rows = await db.select({
    organization_id: subscription.organization_id,
    status: subscription.status,
    trial_ends_at: subscription.trial_ends_at,
    current_period_end: subscription.current_period_end,
  }).from(subscription).where(inArray(subscription.status, ["trialing", "active", "past_due"]))

  const changes: Array<{ organization_id: string; from: string; to: string }> = []
  for (const row of rows) {
    const next = effectiveSubscriptionStatus(row)
    if (next !== row.status) {
      await db.update(subscription).set({ status: next, updated_at: new Date() })
        .where(eq(subscription.organization_id, row.organization_id))
      changes.push({ organization_id: row.organization_id, from: row.status, to: next })
    }
  }

  return NextResponse.json({ ok: true, updated: changes.length, changes })
}
