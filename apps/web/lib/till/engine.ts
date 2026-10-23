"use client"

import {
  anchorsAfterSync, computeLock, EMPTY_ANCHORS, observeClock, reducePushResults, trustedNow,
  type OutboxRef, type PushItemPayload, type PushResult,
} from "@pharmatrack/core/sync"
import { getMeta, setMeta, tillDB, type SyncMeta } from "./db"
import { deviceFetch, NetworkError, SyncHttpError } from "./http"
import {
  bumpAttempts, markRejected, markSynced, noteRetry, outboxCounts, pendingBatch, refusedShiftIds, trimSynced,
} from "./outbox"
import { applyPullPage, newPullContext, type PullResponse } from "./pull-apply"
import { bumpTillData, useTillStore, type SyncSummary } from "./store"
import { currentStaff, openShiftFor, tillSession } from "./staff"

// Offline-first sync engine for a registered browser / desktop till — the web
// twin of apps/mobile/src/lib/sync/engine.ts, speaking the same /api/sync/*
// contract. One run = push the outbox in order (batches of 50), then pull
// every page of changes. The cursor, deadline and clock anchors are only
// written after the LAST pull page, so an interrupted download restarts from
// the previous cursor. Runs are serialised across tabs with a Web Lock.

const PUSH_BATCH = 50
export const DEVICE_WORD = "computer"

const DEFAULT_META: SyncMeta = {
  cursor: null, deadline: null, lastSyncAt: null, clock: EMPTY_ANCHORS, override: null, revoked: false, subscriptionInactive: false,
}

export async function readMeta(): Promise<SyncMeta> {
  const m = await getMeta("sync")
  return { ...DEFAULT_META, ...(m ?? {}), clock: { ...EMPTY_ANCHORS, ...(m?.clock ?? {}) } }
}

export async function writeMeta(patch: Partial<SyncMeta>): Promise<SyncMeta> {
  const next = { ...(await readMeta()), ...patch }
  await setMeta("sync", next)
  return next
}

/** Clock the deadline is judged by: server-anchored, immune to a skewed computer clock. */
export async function trustedClockNow(): Promise<number> {
  return trustedNow((await readMeta()).clock, Date.now())
}

// The signed-in user (from the server-rendered app shell) lives in staff.ts.
// The till refuses to run when it was registered to a different pharmacy.
export { setTillSession, tillSession } from "./staff"

/** Re-derive counts, lock, staff and shift from IndexedDB, and publish them. */
export async function refreshTillState(): Promise<void> {
  const [device, token, meta, counts, branch] = await Promise.all([
    getMeta("device"), getMeta("token"), readMeta(), outboxCounts(), getMeta("branch"),
  ])
  const session = tillSession()
  const registered = !!device && !!token
  const wrongOrg = registered && !!session && !!device.organizationId && device.organizationId !== session.organizationId
  const staff = registered && !wrongOrg ? await currentStaff() : null
  const shift = staff ? await openShiftFor(staff.id) : null
  const lock = computeLock({
    now: trustedNow(meta.clock, Date.now()),
    registered,
    revoked: meta.revoked,
    clockTampered: meta.clock.tampered,
    deadline: meta.deadline,
    override: meta.override,
  })
  useTillStore.setState((s) => ({
    ready: true,
    registered,
    wrongOrg,
    device,
    branch,
    lastSyncAt: meta.lastSyncAt,
    deadline: meta.deadline,
    override: meta.override,
    subscriptionInactive: meta.subscriptionInactive,
    pendingCount: counts.pending,
    pendingSales: counts.pendingSales,
    rejectedCount: counts.rejected,
    pendingShiftCloses: counts.pendingShiftCloses,
    lock,
    staff,
    shift,
    status: meta.revoked ? "revoked" : s.status === "revoked" ? "idle" : s.status,
  }))
}

/** Minute tick + start: feed the clock-tamper guard, then re-evaluate the lock. */
export async function tickClock(): Promise<void> {
  const meta = await readMeta()
  await writeMeta({ clock: observeClock(meta.clock, Date.now()) })
  await refreshTillState()
}

export function setTillOnline(online: boolean): void {
  const s = useTillStore.getState()
  if (s.online === online) return
  const status = !online && s.status === "idle" ? "offline" : online && s.status === "offline" ? "idle" : s.status
  useTillStore.setState({ online, status })
}

// Messages for people — sales are never at risk, so say so.
export const OFFLINE_MESSAGE = "No internet — sales are saved on this computer and will upload when you're back online."
const REVOKED_MESSAGE = "This computer was removed from the pharmacy's devices. A manager must set it up again — sales saved on it are kept and will upload."
const SUBSCRIPTION_MESSAGE = "The pharmacy's subscription is inactive — ask the owner to renew it so this computer can sync. Sales stay saved here."
const RESTART_MESSAGE = "The download had to start over. Press Sync now to finish it."

export type SyncOutcome = "synced" | "partial" | "offline" | "revoked" | "subscription" | "error" | "unregistered"

export interface SyncResult {
  ok: boolean
  outcome: SyncOutcome
  pushed: number
  rejected: number
  productsUpdated: number
  deleted: number
  message?: string
}

const listeners = new Set<(r: SyncResult) => void>()
/** Called after every sync run (e.g. to refresh server-backed views). */
export function onSyncResult(fn: (r: SyncResult) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let running: Promise<SyncResult> | null = null
let queuedForced: Promise<SyncResult> | null = null

function start(): Promise<SyncResult> {
  const run = withTabLock(() => runSync()).finally(() => {
    if (running === run) running = null
  })
  running = run
  return run
}

/** Serialise sync runs across browser tabs (each tab has its own engine). */
async function withTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  if (!locks?.request) return fn()
  return locks.request("pharmatrack-till-sync", fn) as Promise<T>
}

/**
 * Run a sync now. Overlapping calls share the run in progress; `force`
 * (clock-out, "Sync now") waits for it and then runs again, so an item
 * enqueued a moment ago is definitely included.
 */
/** `reason` is for readers of the call site (e.g. "after-sale", "reconnect"). */
export function syncNow(_reason: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  if (!running) return start()
  if (!opts.force) return queuedForced ?? running
  if (!queuedForced) {
    const queued: Promise<SyncResult> = running
      .catch(() => undefined)
      .then(() => {
        queuedForced = null
        return running ? running.catch(() => undefined).then(() => start()) : start()
      })
    queuedForced = queued
  }
  return queuedForced
}

// ── After-sale sync: wait for a quiet moment between customers ─────────────
const QUIET_MS = 4000
const MAX_DEFER_MS = 60_000
let soonTimer: ReturnType<typeof setTimeout> | null = null
let soonSince: number | null = null
let lastActivity = 0
let tillBusy: () => boolean = () => false

/** Registers what "the cashier is mid-sale" means (the cart has lines). */
export function deferSyncWhile(busy: () => boolean): void {
  tillBusy = busy
}

export function noteTillActivity(): void {
  lastActivity = Date.now()
  if (soonTimer) armSoonTimer(QUIET_MS)
}

function armSoonTimer(ms: number): void {
  if (soonTimer) clearTimeout(soonTimer)
  const capLeft = soonSince == null ? ms : Math.max(0, soonSince + MAX_DEFER_MS - Date.now())
  soonTimer = setTimeout(fireSoonSync, Math.min(ms, capLeft))
}

function fireSoonSync(): void {
  soonTimer = null
  const now = Date.now()
  const waited = now - (soonSince ?? now)
  let busy = false
  try {
    busy = tillBusy()
  } catch {
    // a broken guard must never stop sales uploading
  }
  if (waited < MAX_DEFER_MS && (busy || now - lastActivity < QUIET_MS)) {
    armSoonTimer(Math.max(1000, QUIET_MS - (now - lastActivity)))
    return
  }
  soonSince = null
  void syncNow("after-sale")
}

/** Sync soon after a sale, once the till is quiet; a burst of sales uploads together. */
export function scheduleSoonSync(): void {
  if (soonSince == null) soonSince = Date.now()
  armSoonTimer(QUIET_MS)
}

const empty = (outcome: SyncOutcome, message?: string): SyncResult => ({
  ok: false, outcome, pushed: 0, rejected: 0, productsUpdated: 0, deleted: 0, message,
})

async function runSync(): Promise<SyncResult> {
  const token = await getMeta("token")
  const device = await getMeta("device")
  if (!token || !device) {
    await refreshTillState()
    return empty("unregistered")
  }
  if (useTillStore.getState().wrongOrg) return empty("unregistered")

  useTillStore.setState({ status: "syncing", lastError: null, progress: null })
  const result: SyncResult = { ok: false, outcome: "error", pushed: 0, rejected: 0, productsUpdated: 0, deleted: 0 }
  const db = tillDB()

  try {
    // ── Push ──────────────────────────────────────────────────────────────
    const totalAtStart = (await outboxCounts()).pending
    let stopped: { code: string; message: string } | null = null
    let done = 0
    for (;;) {
      const rows = await pendingBatch(PUSH_BATCH)
      if (rows.length === 0) break
      const left = Math.max(totalAtStart - done, rows.length)
      useTillStore.setState({
        progress: { label: `Uploading ${left} item${left === 1 ? "" : "s"}…`, done, total: Math.max(totalAtStart, done + rows.length) },
      })

      // Items that depend on a shift the server refused must not wait on it
      // forever: closes for it are refused locally, sales go up shift-less.
      const refused = await refusedShiftIds()
      const items: PushItemPayload[] = []
      const refs: OutboxRef[] = []
      for (const r of rows) {
        let item = r.payload
        if (item.type === "shift_close" && refused.has(item.client_id)) {
          await markRejected(r.seq!, "shift_rejected", "The server refused this shift's clock-in, so its clock-out can't be recorded")
          continue
        }
        if (item.type === "sale" && item.shift_client_id && refused.has(item.shift_client_id)) {
          item = { ...item, shift_client_id: null }
        }
        items.push(item)
        refs.push({ seq: r.seq!, client_id: item.client_id })
      }
      if (items.length === 0) continue

      await bumpAttempts(refs.map((r) => r.seq))
      const res = await deviceFetch<{ results: PushResult[]; server_time: string }>(token, "/api/sync/push", {
        method: "POST",
        body: { items, app_version: appVersion() },
      })
      const outcome = reducePushResults(refs, res.results ?? [])
      await db.transaction("rw", db.outbox, async () => {
        for (const s of outcome.synced) await markSynced(s.seq, s.serverId, s.flags)
        for (const r of outcome.rejected) await markRejected(r.seq, r.code, r.message)
        if (outcome.stoppedAt) await noteRetry(outcome.stoppedAt.seq, outcome.stoppedAt.code, outcome.stoppedAt.message)
      })
      result.pushed += outcome.synced.length
      result.rejected += outcome.rejected.length
      done += refs.length
      await refreshTillState()
      if (outcome.stoppedAt) {
        stopped = outcome.stoppedAt
        break
      }
    }

    // ── Pull ──────────────────────────────────────────────────────────────
    // Fresh allowances only when nothing is waiting to upload — otherwise the
    // server would hand back stock our unsynced sales already used.
    const refresh = (await outboxCounts()).pending === 0
    const meta = await readMeta()
    const ctx = newPullContext(!meta.cursor, refresh)
    let firstPage: PullResponse | null = null
    let firstPageDeviceTime = Date.now()
    let after: { ts: string; id: string } | null = null
    let page = 0
    for (;;) {
      page++
      useTillStore.setState({
        progress: { label: meta.cursor ? "Downloading changes…" : page === 1 ? "Downloading the product list…" : `Downloading the product list (part ${page})…`, done: page - 1, total: page },
      })
      const qs = new URLSearchParams()
      if (meta.cursor) qs.set("since", meta.cursor)
      if (after) {
        qs.set("after_ts", after.ts)
        qs.set("after_id", after.id)
      }
      if (refresh) qs.set("refresh_allocation", "1")
      const body = await deviceFetch<PullResponse>(token, `/api/sync/pull?${qs.toString()}`)
      if (ctx.first) {
        firstPage = body
        firstPageDeviceTime = Date.now()
      }
      ctx.last = !body.has_more || !body.next
      const counts = await applyPullPage(body, ctx)
      result.productsUpdated += counts.products
      result.deleted += counts.deleted
      ctx.first = false
      if (ctx.last) break
      after = body.next
    }

    // Everything is in — now (and only now) advance the cursor and anchors.
    const serverTime = new Date(firstPage!.server_time).getTime()
    const fullySynced = !stopped
    await writeMeta({
      cursor: firstPage!.cursor,
      clock: anchorsAfterSync(serverTime, firstPageDeviceTime),
      revoked: false,
      subscriptionInactive: false,
      // The deadline only moves once the outbox is fully drained.
      ...(fullySynced ? { deadline: new Date(firstPage!.deadline).getTime(), lastSyncAt: Date.now() } : {}),
    })
    void trimSynced().catch(() => {})

    result.ok = fullySynced
    result.outcome = fullySynced ? "synced" : "partial"
    const summary: SyncSummary = { at: Date.now(), pushed: result.pushed, rejected: result.rejected, productsUpdated: result.productsUpdated, deleted: result.deleted }
    useTillStore.setState({
      status: fullySynced ? "idle" : "error",
      online: true,
      lastError: stopped ? `Some items are still waiting to upload: ${stopped.message}` : null,
      progress: null,
      lastSummary: summary,
    })
    if (stopped) result.message = stopped.message
  } catch (err) {
    useTillStore.setState({ progress: null })
    if (err instanceof NetworkError) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine
      const message = offline ? OFFLINE_MESSAGE : err.message
      useTillStore.setState({ status: offline ? "offline" : "error", online: !offline, lastError: offline ? null : message })
      result.outcome = "offline"
      result.message = message
    } else if (err instanceof SyncHttpError && err.revoked) {
      await writeMeta({ revoked: true })
      useTillStore.setState({ status: "revoked", lastError: REVOKED_MESSAGE })
      result.outcome = "revoked"
      result.message = REVOKED_MESSAGE
    } else if (err instanceof SyncHttpError && err.subscriptionInactive) {
      await writeMeta({ subscriptionInactive: true })
      useTillStore.setState({ status: "error", lastError: SUBSCRIPTION_MESSAGE })
      result.outcome = "subscription"
      result.message = SUBSCRIPTION_MESSAGE
    } else if (err instanceof SyncHttpError && err.code === "bad_cursor") {
      await writeMeta({ cursor: null })
      useTillStore.setState({ status: "error", lastError: RESTART_MESSAGE })
      result.message = RESTART_MESSAGE
    } else {
      if (!(err instanceof SyncHttpError)) console.warn("[till] sync failed", err)
      const message = err instanceof SyncHttpError
        ? err.message
        : "Sync didn't finish. Your sales are safe on this computer — press Sync now to try again."
      useTillStore.setState({ status: "error", lastError: message })
      result.message = message
    }
  } finally {
    await refreshTillState()
    bumpTillData()
  }
  for (const fn of listeners) {
    try {
      fn(result)
    } catch {
      // a listener must never break the engine
    }
  }
  return result
}

export function appVersion(): string {
  const desktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
  return `${desktop ? "desktop" : "web"}-${process.env.NEXT_PUBLIC_APP_VERSION ?? "1"}`
}

// ── Allowance top-up (online only) ──────────────────────────────────────────

/**
 * Ask the server for `quantity` more units of a product from stock nobody
 * holds. Returns the units granted (0 when none are free). The local
 * allowance grows by exactly what was granted. Throws NetworkError when the
 * server can't be reached, so the till can say "no connection" not "none left".
 */
export async function requestTopUp(productId: string, quantity: number): Promise<number> {
  if (quantity <= 0) return 0
  const token = await getMeta("token")
  if (!token) return 0
  try {
    const res = await deviceFetch<{ granted: number; allowance: number; reserved_until: string }>(token, "/api/sync/allocate", {
      method: "POST",
      body: { product_id: productId, quantity: Math.ceil(quantity) },
    })
    setTillOnline(true)
    if (res.granted > 0) {
      const db = tillDB()
      await db.transaction("rw", db.allowances, async () => {
        const cur = await db.allowances.get(productId)
        await db.allowances.put({ product_id: productId, quantity: (cur?.quantity ?? 0) + res.granted, reserved_until: res.reserved_until })
      })
      bumpTillData()
    }
    return res.granted
  } catch (err) {
    if (err instanceof NetworkError) throw err
    return 0
  }
}
