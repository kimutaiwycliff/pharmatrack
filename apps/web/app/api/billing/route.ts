import { NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { withTenant, subscription, plan, subscription_payment } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { paystackConfigured } from "@/lib/billing/paystack"
import { platformContact } from "@/lib/platform-contact"

// Owner-facing billing summary: their subscription + plan + recent payments.
export async function GET() {
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error

  return withTenant(ctx, async (db) => {
    const [sub] = await db.select({
      row: subscription, plan_name: plan.name, plan_price: plan.price_kes, plan_interval: plan.interval,
    }).from(subscription).leftJoin(plan, eq(plan.id, subscription.plan_id))
      .where(eq(subscription.organization_id, ctx.organizationId)).limit(1)

    const payments = await db.select().from(subscription_payment)
      .where(eq(subscription_payment.organization_id, ctx.organizationId))
      .orderBy(desc(subscription_payment.created_at)).limit(20)

    return NextResponse.json({
      subscription: sub
        ? { ...sub.row, plan: sub.plan_name ? { name: sub.plan_name, price_kes: Number(sub.plan_price), interval: sub.plan_interval } : null }
        : null,
      payments: payments.map((p) => ({ ...p, amount_kes: Number(p.amount_kes) })),
      paystackEnabled: paystackConfigured(),
      paymentNumber: platformContact().paymentNumber,
    })
  })
}
