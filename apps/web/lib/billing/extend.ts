import { eq } from "drizzle-orm"
import { subscription, plan, type DrizzleDB } from "@pharmatrack/db"
import { coverageFor, endOfNairobiDay, periodsForAmount } from "./period"

export interface Extension {
  /** Coverage this payment buys, Nairobi calendar days (YYYY-MM-DD). */
  start: string
  end: string
  periods: number
  /** New subscription.current_period_end (end of `end` in Nairobi). */
  currentPeriodEnd: Date
}

/**
 * Mark a tenant's subscription active and extend paid-until, inside the
 * caller's transaction. The subscription row is locked (FOR UPDATE) so two
 * confirmations can't both read the old end date and extend from it.
 *
 * `periodEnd` (an explicit day the operator chose) wins; otherwise the end is
 * computed from `periods` — or from the amount paid ÷ plan price — on top of
 * the later of the current paid-until and the payment day.
 */
export async function extendSubscription(
  tx: DrizzleDB,
  args: { organizationId: string; paidAt: Date; amountKes?: number; periods?: number; periodEnd?: string | null; provider?: string },
): Promise<Extension> {
  const [sub] = await tx.select({
    current_period_end: subscription.current_period_end, interval: plan.interval, price: plan.price_kes,
  }).from(subscription).leftJoin(plan, eq(plan.id, subscription.plan_id))
    .where(eq(subscription.organization_id, args.organizationId)).for("update", { of: subscription }).limit(1)

  const periods = args.periods ?? periodsForAmount(args.amountKes ?? 0, sub?.price == null ? null : Number(sub.price))
  const computed = coverageFor({ currentPeriodEnd: sub?.current_period_end, paidAt: args.paidAt, interval: sub?.interval, periods })
  const end = args.periodEnd ?? computed.end
  const currentPeriodEnd = endOfNairobiDay(end)

  await tx.update(subscription).set({
    status: "active",
    current_period_end: currentPeriodEnd,
    updated_at: new Date(),
    ...(args.provider ? { provider: args.provider } : {}),
  }).where(eq(subscription.organization_id, args.organizationId))

  return { start: computed.start, end, periods, currentPeriodEnd }
}
