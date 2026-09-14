// Computes the tenant's EFFECTIVE subscription status from stored fields — the
// stored `subscription.status` column is only updated by the operator or the
// /api/cron/subscription-expiry sweep, so anything that gates access must
// re-derive the true status from trial_ends_at / current_period_end at read
// time, or a lapsed trial/renewal keeps full access until the next sweep runs.
//
// Grace: an active subscription past current_period_end reads as "past_due"
// for DUNNING_GRACE_DAYS (still fully blocked by SubscriptionGate — the grace
// only changes the message/operator visibility, not access) before "suspended".
// A lapsed trial has no grace — trials are meant to have a hard end.
export const DUNNING_GRACE_DAYS = 3

export interface SubscriptionLike {
  status: string
  trial_ends_at: Date | null
  current_period_end: Date | null
}

export function effectiveSubscriptionStatus(sub: SubscriptionLike | null | undefined): string {
  if (!sub) return "none"
  const now = Date.now()

  if (sub.status === "trialing") {
    if (sub.trial_ends_at && sub.trial_ends_at.getTime() <= now) return "past_due"
    return "trialing"
  }

  if (sub.status === "active") {
    if (sub.current_period_end && sub.current_period_end.getTime() <= now) {
      const graceMs = DUNNING_GRACE_DAYS * 86_400_000
      return sub.current_period_end.getTime() + graceMs <= now ? "suspended" : "past_due"
    }
    return "active"
  }

  return sub.status
}

export const ACTIVE_STATUSES = ["trialing", "active"]
