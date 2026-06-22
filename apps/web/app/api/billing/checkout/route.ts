import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { withTenant, subscription, plan, organization, dbAdmin } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { getSession } from "@/lib/auth/helpers"
import { initializeTransaction, paystackConfigured } from "@/lib/billing/paystack"
import { notifyPlatformSubscription } from "@/lib/notifications/platform"

// Owner starts (or renews) their subscription payment via Paystack.
export async function POST() {
  const ctx = await getApiContext({ roles: ["owner"] })
  if ("error" in ctx) return ctx.error

  if (!paystackConfigured()) {
    return NextResponse.json({ error: "Online payment isn't enabled. Contact PharmaTrack." }, { status: 503 })
  }

  const session = await getSession()
  const email = session?.user?.email
  if (!email) return NextResponse.json({ error: "No email on file" }, { status: 400 })

  const planRow = await withTenant(ctx.organizationId, async (db) => {
    const [sub] = await db.select({ name: plan.name, price_kes: plan.price_kes, interval: plan.interval })
      .from(subscription).leftJoin(plan, eq(plan.id, subscription.plan_id))
      .where(eq(subscription.organization_id, ctx.organizationId)).limit(1)
    return sub ?? null
  })
  if (!planRow?.name || !planRow.price_kes || Number(planRow.price_kes) <= 0) {
    return NextResponse.json({ error: "No plan price configured for your pharmacy" }, { status: 400 })
  }

  try {
    const { authorizationUrl } = await initializeTransaction({
      email,
      amountKes: Number(planRow.price_kes),
      metadata: { organization_id: ctx.organizationId, plan_name: planRow.name, type: "subscription" },
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/settings`,
    })

    // Tell the platform someone is starting a paid subscription (best-effort).
    const [org] = await dbAdmin().select({ name: organization.name }).from(organization).where(eq(organization.id, ctx.organizationId)).limit(1)
    await notifyPlatformSubscription({ pharmacy: org?.name ?? ctx.organizationId, plan: planRow.name, email })

    return NextResponse.json({ authorization_url: authorizationUrl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Payment init failed" }, { status: 502 })
  }
}
