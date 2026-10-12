import { addMonthsToDay, nairobiDay } from "@/lib/billing/period"

// Daily sync deadline: a device must sync each day's sales before midnight in
// Nairobi. Its offline selling permission (and stock allowance) expire then.
// The server keeps the allowance reserved for a further grace window so a
// manager PIN override can keep the shop open until noon without the web till
// selling the same units.

export const OVERRIDE_GRACE_HOURS = 12

/** Start of the next Nairobi calendar day (00:00 EAT) after `now`. */
export function nextNairobiMidnight(now = new Date()): Date {
  const today = nairobiDay(now)
  const [y, m, d] = today.split("-").map(Number) as [number, number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const tomorrow = d < last ? `${y}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}` : addMonthsToDay(`${y}-${String(m).padStart(2, "0")}-01`, 1)
  return new Date(`${tomorrow}T00:00:00+03:00`)
}

/** When the server stops holding today's allowances (midnight + grace). */
export function reservationExpiry(now = new Date()): Date {
  return new Date(nextNairobiMidnight(now).getTime() + OVERRIDE_GRACE_HOURS * 3_600_000)
}

/** Synced after the deadline of the day it was sold on. */
export function isLateSync(soldAt: Date, receivedAt = new Date()): boolean {
  return receivedAt.getTime() >= nextNairobiMidnight(soldAt).getTime()
}
