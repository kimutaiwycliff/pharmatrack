// Pure billing display rules (unit tested). Mirrors
// apps/web/components/settings/BillingPanel.tsx: the status shown is the
// server's effective_status (a lapsed "active" period already reads as
// past_due/suspended), and the date shown depends on it — trial end while
// trialing, otherwise the paid-until date.

export type BadgeTone = "ok" | "warning" | "danger" | "neutral"

export interface BillingPlan {
  name: string
  price_kes: number
  interval: string
}

export interface BillingSubscription {
  status: string
  effective_status?: string
  current_period_end: string | null
  trial_ends_at: string | null
  plan: BillingPlan | null
}

export interface BillingPayment {
  id: string
  amount_kes: number
  method: string | null
  reference: string | null
  created_at: string
  status: string
  period_end?: string | null
}

export interface BillingData {
  subscription: BillingSubscription | null
  payments: BillingPayment[]
  paystackEnabled: boolean
  paymentNumber: string | null
}

export function effectiveStatus(sub: BillingSubscription | null | undefined): string {
  return sub?.effective_status ?? sub?.status ?? "none"
}

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  trialing: { tone: "ok", label: "Trial" },
  active: { tone: "ok", label: "Active" },
  past_due: { tone: "warning", label: "Past due" },
  suspended: { tone: "danger", label: "Suspended" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  none: { tone: "neutral", label: "No subscription" },
}

export function subscriptionBadge(status: string): { tone: BadgeTone; label: string } {
  return STATUS[status] ?? { tone: "neutral", label: status.replace(/_/g, " ") }
}

const PAYMENT: Record<string, { tone: BadgeTone; label: string }> = {
  confirmed: { tone: "ok", label: "Confirmed" },
  pending: { tone: "warning", label: "Awaiting confirmation" },
  rejected: { tone: "danger", label: "Rejected" },
}

export function paymentBadge(status: string): { tone: BadgeTone; label: string } {
  return PAYMENT[status] ?? { tone: "neutral", label: status }
}

/** Whole days until an instant, rounded up (web's lib/billing/period daysLeft). */
export function daysLeft(iso: string, now: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000)
}

export interface RenewalInfo {
  /** "Trial ends" / "Active until" / "Expired on" */
  label: string
  date: string | null
  /** Days left (null when there's no date or it has passed). */
  daysLeft: number | null
  /** "Today" / "In 1 day" / "In 12 days" */
  countdown: string | null
  /** Seven days or fewer — show it as a warning. */
  soon: boolean
}

export function renewalInfo(sub: BillingSubscription | null | undefined, now: Date = new Date()): RenewalInfo {
  const status = effectiveStatus(sub)
  const date = status === "trialing" ? (sub?.trial_ends_at ?? null) : (sub?.current_period_end ?? null)
  const label = status === "trialing" ? "Trial ends" : status === "active" ? "Active until" : "Expired on"
  const left = date ? daysLeft(date, now) : null
  const showLeft = left != null && left >= 0 ? left : null
  return {
    label,
    date,
    daysLeft: showLeft,
    countdown: showLeft == null ? null : showLeft === 0 ? "Today" : `In ${showLeft} day${showLeft === 1 ? "" : "s"}`,
    soon: showLeft != null && showLeft <= 7,
  }
}

export function intervalLabel(interval: string): string {
  if (interval === "monthly") return "month"
  if (interval === "annual") return "year"
  return interval
}

export function pendingPayment(payments: BillingPayment[]): BillingPayment | null {
  return payments.find((p) => p.status === "pending") ?? null
}
