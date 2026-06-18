// PharmaTrack worker — minimal background scheduler.
//
// Today its only job is to drive the appointment-reminder cron: the web app
// exposes /api/cron/appointment-reminders (CRON_SECRET-guarded), which sends any
// due, pending reminders and is idempotent (already-sent rows leave the pending
// set). This process simply calls that endpoint on a fixed interval.
//
// Deliberately dependency-free (Node 22 globals only: fetch, setInterval), so it
// ships as a plain file inside the web image — no build step, no lockfile entry.
// When real queue work arrives, this is the home for a BullMQ worker (see
// CLAUDE.md §4 / DEPLOYMENT.md); swap the tick body for queue processors then.

const TARGET = process.env.CRON_TARGET_URL || "http://web:3000"
const SECRET = process.env.CRON_SECRET
// Default: hourly. The endpoint only sends reminders whose send_at has passed,
// so an hourly tick delivers day-before reminders within the hour they are due.
const INTERVAL_MS = Number(process.env.REMINDER_INTERVAL_MS || 60 * 60 * 1000)
const REMINDER_URL = `${TARGET.replace(/\/$/, "")}/api/cron/appointment-reminders`

function log(level, msg, extra) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, svc: "worker", msg, ...extra }) + "\n",
  )
}

if (!SECRET) {
  log("error", "CRON_SECRET is not set — cannot authenticate to the cron endpoint; exiting")
  process.exit(1)
}

let running = false

async function runReminders() {
  // Skip if a previous tick is still in flight (a slow endpoint shouldn't stack calls).
  if (running) return
  running = true
  const started = Date.now()
  try {
    const res = await fetch(REMINDER_URL, {
      method: "GET",
      headers: { authorization: `Bearer ${SECRET}` },
      // Don't let a hung server wedge the worker forever.
      signal: AbortSignal.timeout(60_000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      log("error", "reminder cron returned non-2xx", { status: res.status, body, ms: Date.now() - started })
    } else {
      log("info", "reminder cron ok", { ...body, ms: Date.now() - started })
    }
  } catch (err) {
    // Network blip / web not ready — log and let the next tick retry.
    log("error", "reminder cron call failed", { error: String(err?.message || err), ms: Date.now() - started })
  } finally {
    running = false
  }
}

log("info", "worker started", { target: REMINDER_URL, intervalMs: INTERVAL_MS })

// Run once on boot (web is gated by depends_on: service_healthy), then on interval.
runReminders()
const timer = setInterval(runReminders, INTERVAL_MS)

function shutdown(signal) {
  log("info", "shutting down", { signal })
  clearInterval(timer)
  process.exit(0)
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
