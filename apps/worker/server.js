// PharmaTrack worker — minimal background scheduler.
//
// Drives three CRON_SECRET-guarded, idempotent cron endpoints on the web app
// by calling them on a fixed interval: appointment-reminders (day-before
// reminders), subscription-expiry (flips trialing/active → past_due →
// suspended once trial_ends_at / current_period_end has passed, so tenant
// access is actually cut off instead of a stale status lingering forever),
// and subscription-reminders (polite "your trial/subscription ends soon"
// emails to the tenant owner, 7 days and 1 day out).
//
// Deliberately dependency-free (Node 22 globals only: fetch, setInterval), so it
// ships as a plain file inside the web image — no build step, no lockfile entry.
// When real queue work arrives, this is the home for a BullMQ worker (see
// CLAUDE.md §4 / DEPLOYMENT.md); swap the tick bodies for queue processors then.

const TARGET = process.env.CRON_TARGET_URL || "http://web:3000"
const SECRET = process.env.CRON_SECRET
// Default: hourly. The endpoint only sends reminders whose send_at has passed,
// so an hourly tick delivers day-before reminders within the hour they are due.
const INTERVAL_MS = Number(process.env.REMINDER_INTERVAL_MS || 60 * 60 * 1000)
const REMINDER_URL = `${TARGET.replace(/\/$/, "")}/api/cron/appointment-reminders`

// Default: every 6 hours — expiry is date-only granularity, no need for hourly.
const SUBSCRIPTION_INTERVAL_MS = Number(process.env.SUBSCRIPTION_SWEEP_INTERVAL_MS || 6 * 60 * 60 * 1000)
const SUBSCRIPTION_URL = `${TARGET.replace(/\/$/, "")}/api/cron/subscription-expiry`

// Default: once daily — the 7-day/1-day reminder windows only need to be
// checked once a day to never miss a milestone.
const REMINDER_SWEEP_INTERVAL_MS = Number(process.env.SUBSCRIPTION_REMINDER_INTERVAL_MS || 24 * 60 * 60 * 1000)
const SUBSCRIPTION_REMINDER_URL = `${TARGET.replace(/\/$/, "")}/api/cron/subscription-reminders`

function log(level, msg, extra) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, svc: "worker", msg, ...extra }) + "\n",
  )
}

if (!SECRET) {
  log("error", "CRON_SECRET is not set — cannot authenticate to the cron endpoint; exiting")
  process.exit(1)
}

const inFlight = new Set()

async function runTick(label, url) {
  // Skip if a previous tick of this job is still in flight (a slow endpoint shouldn't stack calls).
  if (inFlight.has(label)) return
  inFlight.add(label)
  const started = Date.now()
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${SECRET}` },
      // Don't let a hung server wedge the worker forever.
      signal: AbortSignal.timeout(60_000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      log("error", `${label} cron returned non-2xx`, { status: res.status, body, ms: Date.now() - started })
    } else {
      log("info", `${label} cron ok`, { ...body, ms: Date.now() - started })
    }
  } catch (err) {
    // Network blip / web not ready — log and let the next tick retry.
    log("error", `${label} cron call failed`, { error: String(err?.message || err), ms: Date.now() - started })
  } finally {
    inFlight.delete(label)
  }
}

const runReminders = () => runTick("reminder", REMINDER_URL)
const runSubscriptionSweep = () => runTick("subscription-expiry", SUBSCRIPTION_URL)
const runSubscriptionReminders = () => runTick("subscription-reminder", SUBSCRIPTION_REMINDER_URL)

log("info", "worker started", {
  reminderTarget: REMINDER_URL, reminderIntervalMs: INTERVAL_MS,
  subscriptionTarget: SUBSCRIPTION_URL, subscriptionIntervalMs: SUBSCRIPTION_INTERVAL_MS,
  subscriptionReminderTarget: SUBSCRIPTION_REMINDER_URL, subscriptionReminderIntervalMs: REMINDER_SWEEP_INTERVAL_MS,
})

// Run once each on boot (web is gated by depends_on: service_healthy), then on interval.
runReminders()
runSubscriptionSweep()
runSubscriptionReminders()
const timer = setInterval(runReminders, INTERVAL_MS)
const subscriptionTimer = setInterval(runSubscriptionSweep, SUBSCRIPTION_INTERVAL_MS)
const subscriptionReminderTimer = setInterval(runSubscriptionReminders, REMINDER_SWEEP_INTERVAL_MS)

function shutdown(signal) {
  log("info", "shutting down", { signal })
  clearInterval(timer)
  clearInterval(subscriptionTimer)
  clearInterval(subscriptionReminderTimer)
  process.exit(0)
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
