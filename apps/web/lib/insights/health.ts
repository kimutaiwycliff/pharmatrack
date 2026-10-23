// How healthy a pharmacy's use of PharmaTrack is, for the operator console
// and the weekly digest. Pure: the caller passes what the database knows.
//
//   new            signed up < 7 days ago, no sale yet ("Getting started")
//   never_started  signed up ≥ 7 days ago and has never made a sale
//   inactive       nobody used it for more than 14 days
//   at_risk        last used 8–14 days ago
//   slipping       last used 4–7 days ago, or sales fell by half vs the previous 30 days
//   healthy        used in the last 3 days and sales holding up
//
// "Used" = the latest of a sign-in / open app, a sale, or a device sync.

export type HealthLevel = "healthy" | "new" | "slipping" | "at_risk" | "never_started" | "inactive"

export interface HealthInput {
  now: number
  createdAt: number
  lastActiveAt: number | null
  firstSaleAt: number | null
  revenue30: number
  revenuePrev30: number
  activeStaff30: number
  staffCount: number
  subscriptionStatus: string | null
  /** trial end / paid-until, epoch ms */
  renewsAt: number | null
}

export interface Health {
  level: HealthLevel
  label: string
  /** most urgent first; plain sentences for the operator */
  reasons: string[]
  /** for sorting: higher = needs attention sooner */
  urgency: number
  daysSinceActive: number | null
}

const DAY = 86_400_000

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  healthy: "Healthy",
  new: "Getting started",
  slipping: "Slipping",
  at_risk: "At risk",
  never_started: "Never started",
  inactive: "Inactive",
}

const URGENCY: Record<HealthLevel, number> = { healthy: 0, new: 1, slipping: 2, at_risk: 3, never_started: 4, inactive: 5 }

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`

export function computeHealth(i: HealthInput): Health {
  const age = Math.floor((i.now - i.createdAt) / DAY)
  const idle = i.lastActiveAt == null ? null : Math.max(0, Math.floor((i.now - i.lastActiveAt) / DAY))
  const reasons: string[] = []

  let level: HealthLevel
  if (i.firstSaleAt == null && age < 7) level = "new"
  else if (i.firstSaleAt == null) level = "never_started"
  else if (idle == null || idle > 14) level = "inactive"
  else if (idle >= 8) level = "at_risk"
  else if (idle >= 4) level = "slipping"
  else level = "healthy"

  // Sales falling hard while still logging in is slipping too.
  const drop = i.revenuePrev30 > 0 ? 1 - i.revenue30 / i.revenuePrev30 : 0
  if (level === "healthy" && drop >= 0.5) level = "slipping"

  if (level === "never_started" || level === "new") {
    reasons.push(i.lastActiveAt == null ? `Signed up ${days(age)} ago and hasn't used it yet` : `No sale yet — signed up ${days(age)} ago`)
  } else if (idle == null) {
    reasons.push("No recorded activity")
  } else if (idle >= 1) {
    reasons.push(`No activity in ${days(idle)}`)
  }
  if (drop >= 0.25 && i.revenuePrev30 > 0) reasons.push(`Sales down ${Math.round(drop * 100)}% vs the previous 30 days`)
  if (i.staffCount > 1 && i.activeStaff30 < i.staffCount) {
    reasons.push(`${i.activeStaff30} of ${i.staffCount} staff active this month`)
  }
  if (i.subscriptionStatus === "past_due") reasons.push("Subscription payment overdue")
  if (i.subscriptionStatus === "suspended") reasons.push("Subscription suspended")
  if (i.subscriptionStatus === "trialing" && i.renewsAt != null) {
    const left = Math.ceil((i.renewsAt - i.now) / DAY)
    if (left >= 0 && left <= 7) reasons.push(left === 0 ? "Trial ends today" : `Trial ends in ${days(left)}`)
  }

  return { level, label: HEALTH_LABEL[level], reasons, urgency: URGENCY[level], daysSinceActive: idle }
}
