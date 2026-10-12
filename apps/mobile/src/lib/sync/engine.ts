import { sqlite } from "../../db/database"
import { env } from "../env"
import { kvGetSync, kvSetSync } from "../kv"
import { useSyncStore, type SyncSummary } from "../../store/sync"
import { appVersion, getDeviceInfo, getDeviceToken, META_KEY } from "./device"
import { deviceFetch, NetworkError, SyncHttpError } from "./http"
import {
  bumpAttempts, markRejected, markSynced, noteRetry, outboxCounts, pendingBatch, pendingSaleQuantities, refusedShiftIds,
} from "./outbox"
import { applyPullPage, type PullContext, type PullResponse } from "./pull-apply"
import { migrateLegacyQueue } from "./legacy"
import { updateDeadlineReminders } from "./notifications"
import { anchorsAfterSync, EMPTY_ANCHORS, observeClock, trustedNow, type ClockAnchors } from "./core/clock"
import { computeLock, type OverrideRecord } from "./core/lock"
import { reducePushResults, type OutboxRef, type PushResult } from "./core/push-result"
import type { PushItemPayload } from "./core/payload"

// R1 offline-first sync engine. One run = push the outbox in order (batches
// of 50), then pull every page of changes. Mounted app-wide from the root
// layout via <SyncRunner/>; completely inert in the Offline Edition build
// (EXPO_PUBLIC_OFFLINE_MODE), which has no server.
//
// Persistent state (kv `sync_meta`): pull cursor, daily deadline, clock
// anchors, the active manager override, revoked/subscription flags. The
// cursor/deadline/anchors are only written after the LAST pull page, so an
// interrupted download simply restarts from the previous cursor.

export interface SyncMeta {
  cursor: string | null
  deadline: number | null
  lastSyncAt: number | null
  clock: ClockAnchors
  override: OverrideRecord | null
  revoked: boolean
  subscriptionInactive: boolean
}

const DEFAULT_META: SyncMeta = {
  cursor: null,
  deadline: null,
  lastSyncAt: null,
  clock: EMPTY_ANCHORS,
  override: null,
  revoked: false,
  subscriptionInactive: false,
}

const PUSH_BATCH = 50

export function readMeta(): SyncMeta {
  const m = kvGetSync<Partial<SyncMeta>>(META_KEY)
  return { ...DEFAULT_META, ...(m ?? {}), clock: { ...EMPTY_ANCHORS, ...(m?.clock ?? {}) } }
}

export function writeMeta(patch: Partial<SyncMeta>): SyncMeta {
  const next = { ...readMeta(), ...patch }
  kvSetSync(META_KEY, next)
  return next
}

/** Clock the deadline is judged by: server-anchored, immune to a skewed phone clock. */
export function trustedClockNow(): number {
  return trustedNow(readMeta().clock, Date.now())
}

/** Re-derive counts + lock from the database and meta, and publish them. */
export function refreshSyncState(): void {
  if (env.EXPO_PUBLIC_OFFLINE_MODE) return
  const meta = readMeta()
  const device = getDeviceInfo()
  const counts = outboxCounts()
  const lock = computeLock({
    now: trustedNow(meta.clock, Date.now()),
    registered: !!device,
    revoked: meta.revoked,
    clockTampered: meta.clock.tampered,
    deadline: meta.deadline,
    override: meta.override,
  })
  useSyncStore.setState({
    device,
    lastSyncAt: meta.lastSyncAt,
    deadline: meta.deadline,
    override: meta.override,
    subscriptionInactive: meta.subscriptionInactive,
    pendingCount: counts.pending,
    pendingSales: counts.pendingSales,
    rejectedCount: counts.rejected,
    pendingShiftCloses: counts.pendingShiftCloses,
    lock,
    lockReason: lock.reason,
    ...(meta.revoked ? { status: "revoked" as const } : {}),
  })
  void updateDeadlineReminders(counts.pendingSales, meta.deadline)
}

/** Minute tick + app start: feed the clock-tamper guard, then re-evaluate the lock. */
export function tickClock(): void {
  if (env.EXPO_PUBLIC_OFFLINE_MODE) return
  const meta = readMeta()
  writeMeta({ clock: observeClock(meta.clock, Date.now()) })
  refreshSyncState()
}

export function initSync(): void {
  if (env.EXPO_PUBLIC_OFFLINE_MODE) {
    useSyncStore.setState({ ready: true, status: "idle" })
    return
  }
  tickClock()
  useSyncStore.setState({ ready: true })
}

export function setOnline(online: boolean): void {
  const s = useSyncStore.getState()
  if (s.online === online) return
  const status = !online && s.status === "idle" ? "offline" : online && s.status === "offline" ? "idle" : s.status
  useSyncStore.setState({ online, status })
}

// ── Run control ─────────────────────────────────────────────────────────────

export type SyncOutcome = "synced" | "partial" | "offline" | "revoked" | "subscription" | "error" | "unregistered" | "disabled"

export interface SyncResult {
  ok: boolean
  outcome: SyncOutcome
  pushed: number
  rejected: number
  productsUpdated: number
  deleted: number
  message?: string
}

let running: Promise<SyncResult> | null = null
let soonTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Run a sync now. Overlapping calls share the run in progress; `force`
 * (clock-out) waits for it and then runs again, so an item enqueued a moment
 * ago is definitely included.
 */
export async function syncNow(reason: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  if (env.EXPO_PUBLIC_OFFLINE_MODE) {
    return { ok: false, outcome: "disabled", pushed: 0, rejected: 0, productsUpdated: 0, deleted: 0 }
  }
  while (running) {
    if (!opts.force) return running
    await running.catch(() => undefined)
  }
  running = runSync(reason).finally(() => {
    running = null
  })
  return running
}

/** Debounced sync ~2s after a sale, so a burst of sales uploads together. */
export function scheduleSoonSync(): void {
  if (env.EXPO_PUBLIC_OFFLINE_MODE) return
  if (soonTimer) clearTimeout(soonTimer)
  soonTimer = setTimeout(() => {
    soonTimer = null
    void syncNow("after-sale")
  }, 2000)
}

export function isSyncRunning(): boolean {
  return running != null
}

const empty = (outcome: SyncOutcome, message?: string): SyncResult => ({
  ok: false, outcome, pushed: 0, rejected: 0, productsUpdated: 0, deleted: 0, message,
})

async function runSync(_reason: string): Promise<SyncResult> {
  try {
    await migrateLegacyQueue()
  } catch {
    // never let the old queue block the new one
  }

  const token = await getDeviceToken()
  if (!token || !getDeviceInfo()) {
    refreshSyncState()
    return empty("unregistered")
  }

  useSyncStore.setState({ status: "syncing", lastError: null, progress: null })
  const result: SyncResult = { ok: false, outcome: "error", pushed: 0, rejected: 0, productsUpdated: 0, deleted: 0 }

  try {
    // ── Push ──────────────────────────────────────────────────────────────
    const totalAtStart = outboxCounts().pending
    let stopped: { code: string; message: string } | null = null
    let done = 0
    for (;;) {
      const rows = pendingBatch(PUSH_BATCH)
      if (rows.length === 0) break
      useSyncStore.setState({
        progress: { phase: "push", label: `Uploading ${Math.max(totalAtStart - done, rows.length)} item${totalAtStart - done === 1 ? "" : "s"}…`, done, total: Math.max(totalAtStart, done + rows.length) },
      })

      // Items that depend on a shift the server refused must not wait on it
      // forever: closes for it are refused locally, sales go up shift-less.
      const refused = refusedShiftIds()
      const items: PushItemPayload[] = []
      const refs: OutboxRef[] = []
      for (const r of rows) {
        let item: PushItemPayload
        try {
          item = JSON.parse(r.payload) as PushItemPayload
        } catch {
          markRejected(r.seq, "unreadable", "This item was damaged on the phone and can't be uploaded")
          continue
        }
        if (item.type === "shift_close" && refused.has(item.client_id)) {
          markRejected(r.seq, "shift_rejected", "The server refused this shift's clock-in, so its clock-out can't be recorded")
          continue
        }
        if (item.type === "sale" && item.shift_client_id && refused.has(item.shift_client_id)) {
          item = { ...item, shift_client_id: null }
        }
        items.push(item)
        refs.push({ seq: r.seq, client_id: item.client_id })
      }
      if (items.length === 0) continue

      bumpAttempts(refs.map((r) => r.seq))
      const res = await deviceFetch<{ results: PushResult[]; server_time: string }>(token, "/api/sync/push", {
        method: "POST",
        body: { items, app_version: appVersion() },
      })
      const outcome = reducePushResults(refs, res.results ?? [])
      sqlite.withTransactionSync(() => {
        for (const s of outcome.synced) markSynced(s.seq, s.serverId, s.flags)
        for (const r of outcome.rejected) markRejected(r.seq, r.code, r.message)
        if (outcome.stoppedAt) noteRetry(outcome.stoppedAt.seq, outcome.stoppedAt.code, outcome.stoppedAt.message)
      })
      result.pushed += outcome.synced.length
      result.rejected += outcome.rejected.length
      done += refs.length
      refreshSyncState()
      if (outcome.stoppedAt) {
        stopped = outcome.stoppedAt
        break
      }
    }

    // ── Pull ──────────────────────────────────────────────────────────────
    // Fresh allowances only when nothing is waiting to upload — otherwise the
    // server would hand back stock our unsynced sales already used.
    const refresh = outboxCounts().pending === 0
    const meta = readMeta()
    const full = !meta.cursor
    const ctx: PullContext = {
      first: true,
      last: false,
      refreshedAllocation: refresh,
      pending: refresh ? new Map() : pendingSaleQuantities(),
      stockMap: new Map(),
      seenProducts: full ? new Set() : null,
      seenPacks: full ? new Set() : null,
      seenCategories: full ? new Set() : null,
    }
    let firstPage: PullResponse | null = null
    let firstPageDeviceTime = Date.now()
    let after: { ts: string; id: string } | null = null
    let page = 0
    for (;;) {
      page++
      useSyncStore.setState({ progress: { phase: "pull", label: page === 1 ? "Downloading changes…" : `Downloading changes (part ${page})…`, done: page - 1, total: page } })
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
      const counts = applyPullPage(body, ctx)
      result.productsUpdated += counts.products
      result.deleted += counts.deleted
      ctx.first = false
      if (ctx.last) break
      after = body.next
    }

    // Everything is in — now (and only now) advance the cursor and anchors.
    const serverTime = new Date(firstPage!.server_time).getTime()
    const fullySynced = !stopped
    writeMeta({
      cursor: firstPage!.cursor,
      clock: anchorsAfterSync(serverTime, firstPageDeviceTime),
      revoked: false,
      subscriptionInactive: false,
      // The deadline only moves once the outbox is fully drained: a sync that
      // left sales stuck on the phone doesn't count as "synced for today".
      ...(fullySynced ? { deadline: new Date(firstPage!.deadline).getTime(), lastSyncAt: Date.now() } : {}),
    })

    result.ok = fullySynced
    result.outcome = fullySynced ? "synced" : "partial"
    const summary: SyncSummary = { at: Date.now(), pushed: result.pushed, rejected: result.rejected, productsUpdated: result.productsUpdated, deleted: result.deleted }
    useSyncStore.setState({
      status: fullySynced ? "idle" : "error",
      online: true,
      lastError: stopped ? `Some items are waiting for the server: ${stopped.message}` : null,
      progress: null,
      lastSummary: summary,
    })
    if (stopped) result.message = stopped.message
  } catch (err) {
    useSyncStore.setState({ progress: null })
    if (err instanceof NetworkError) {
      useSyncStore.setState({ status: "offline", online: false, lastError: null })
      result.outcome = "offline"
      result.message = "No connection"
    } else if (err instanceof SyncHttpError && err.revoked) {
      writeMeta({ revoked: true })
      useSyncStore.setState({ status: "revoked", lastError: err.message })
      result.outcome = "revoked"
      result.message = err.message
    } else if (err instanceof SyncHttpError && err.subscriptionInactive) {
      writeMeta({ subscriptionInactive: true })
      useSyncStore.setState({ status: "error", lastError: "Subscription inactive — renew to keep syncing." })
      result.outcome = "subscription"
      result.message = "Subscription inactive — renew to keep syncing."
    } else if (err instanceof SyncHttpError && err.code === "bad_cursor") {
      // The server didn't like our cursor: start a full download next time.
      writeMeta({ cursor: null })
      useSyncStore.setState({ status: "error", lastError: "Sync restarted — tap Sync now" })
      result.message = err.message
    } else {
      const message = err instanceof Error ? err.message : String(err)
      useSyncStore.setState({ status: "error", lastError: message })
      result.message = message
    }
  } finally {
    refreshSyncState()
  }
  return result
}

// ── Allowance top-up (online only) ──────────────────────────────────────────

/**
 * Ask the server for `quantity` more units of a product from stock nobody
 * holds. Returns the units granted (0 when offline or none free). The local
 * allowance grows by exactly what was granted — never set to the server's
 * total, which still includes our unsynced sales.
 */
export async function requestTopUp(productId: string, quantity: number): Promise<number> {
  if (env.EXPO_PUBLIC_OFFLINE_MODE || quantity <= 0) return 0
  const token = await getDeviceToken()
  if (!token) return 0
  try {
    const res = await deviceFetch<{ granted: number; allowance: number; reserved_until: string }>(token, "/api/sync/allocate", {
      method: "POST",
      body: { product_id: productId, quantity: Math.ceil(quantity) },
    })
    if (res.granted > 0) {
      sqlite.runSync(
        `INSERT INTO allowances (product_id, quantity, reserved_until, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET quantity = allowances.quantity + excluded.quantity,
           reserved_until = excluded.reserved_until, updated_at = excluded.updated_at`,
        [productId, res.granted, res.reserved_until, Date.now()],
      )
    }
    return res.granted
  } catch (err) {
    if (err instanceof NetworkError) setOnline(false)
    return 0
  }
}
