// Subscription coverage maths — pure, shared by the operator console (live
// preview in the confirm dialog), the payment API routes (server default when
// no date is sent) and the Paystack webhook, so all three agree.
//
// Dates are Nairobi calendar days ("YYYY-MM-DD"). A period that "ends 12 Nov"
// gives access until the END of 12 Nov in Nairobi (23:59:59 EAT), not UTC
// midnight (03:00 EAT), which used to cut tenants off at dawn.

export type BillingInterval = "monthly" | "annual"

const NAIROBI = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" })

/** Nairobi calendar day of an instant, as YYYY-MM-DD. */
export function nairobiDay(d: Date): string {
  return NAIROBI.format(d)
}

/** The last instant of a Nairobi calendar day (EAT is UTC+3, no DST). */
export function endOfNairobiDay(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+03:00`)
}

/** Add whole months to a calendar day, clamping to the month's last day
 *  (31 Jan + 1 month = 28/29 Feb, not 3 Mar as Date#setMonth gives). */
export function addMonthsToDay(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number]
  const total = y * 12 + (m - 1) + months
  const ty = Math.floor(total / 12)
  const tm = total % 12 // 0-based
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  const td = Math.min(d, lastDay)
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(td).padStart(2, "0")}`
}

export function monthsPerInterval(interval: string | null | undefined): number {
  return interval === "annual" ? 12 : 1
}

/** How many billing periods an amount pays for (at least 1). */
export function periodsForAmount(amountKes: number, priceKes: number | null | undefined): number {
  if (!priceKes || priceKes <= 0 || !(amountKes > 0)) return 1
  return Math.max(1, Math.round(amountKes / priceKes))
}

/**
 * Coverage bought by a payment: starts at the LATER of the current paid-until
 * day and the payment day (paying early never loses the remaining days; paying
 * late doesn't back-date into the lapsed gap) and runs `periods` intervals.
 */
export function coverageFor(args: {
  currentPeriodEnd: Date | string | null | undefined
  paidAt: Date
  interval: string | null | undefined
  periods: number
}): { start: string; end: string } {
  const paidDay = nairobiDay(args.paidAt)
  const currentDay = args.currentPeriodEnd ? nairobiDay(new Date(args.currentPeriodEnd)) : null
  const start = currentDay && currentDay > paidDay ? currentDay : paidDay
  const end = addMonthsToDay(start, monthsPerInterval(args.interval) * Math.max(1, Math.floor(args.periods)))
  return { start, end }
}

/** Whole days from now until the end of a Nairobi day (negative once past). */
export function daysLeft(periodEnd: Date | string, now = new Date()): number {
  return Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86_400_000)
}
