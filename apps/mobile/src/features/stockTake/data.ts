import { ApiError, apiJson, withQuery } from "../../lib/api"
import { kvDelete, kvGet, kvSet } from "../../lib/kv"
import { mergeQueue, queueSize, settleQueue, type LinePayload, type PendingQueue, type SessionData, type Shelf, type StockTakeItem } from "./logic"

// Stock take on Android (ADR-020): the web API (apps/web/app/api/stock-take),
// plus what makes counting work with no signal. Starting a count needs the
// server; once open, the shelf is cached on the phone and every counted line
// goes into a queue in kv_store that is sent when the connection comes back —
// even after the app was closed. Line ids are made on the phone, so a resend
// is an upsert on the server, never a duplicate.

export interface ShelvesData {
  shelves: Shelf[]
  sessions: { id: string; kind: "count" | "setup"; title: string; status: "draft" | "review" | "posted"; posted_at: string | null; created_by: string | null; lines: number; totals: Record<string, number> | null }[]
  can: { adjust: boolean; setup: boolean; viewCost: boolean }
}
export interface Preview {
  summary: { counted: number; changed: number; unitsFound: number; unitsMissing: number; valueFound: number | null; valueMissing: number | null; newBatches: number; newProducts: number; unpriced: number; approvalReasons: string[] }
  rows: { id: string; kind: "batch" | "new_batch" | "new_product"; name: string; controlled: boolean; batch_number: string | null; expiry: string | null; expected: number | null; counted: number; delta: number; value: number | null; price: number | null }[]
  needsApproval: boolean
}

const sessionKey = (id: string) => `stocktake:session:${id}`
const queueKey = (id: string) => `stocktake:queue:${id}`
const PENDING_IDS = "stocktake:pending"
const EMPTY: PendingQueue = { lines: {}, deletes: [] }

/** Shelves + sessions for a branch; the last copy is kept so counts in progress open offline. */
export async function fetchShelves(branchId: string): Promise<ShelvesData & { offline: boolean }> {
  const key = `stocktake:shelves:${branchId}`
  try {
    const data = await apiJson<ShelvesData>(withQuery("/api/stock-take", { branch_id: branchId }))
    await kvSet(key, data)
    return { ...data, offline: false }
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      const cached = await kvGet<ShelvesData>(key)
      if (cached) return { ...cached, offline: true }
    }
    throw err
  }
}

export const startSession = (body: { branch_id: string; kind: "count" | "setup"; category_id: string | null; taxonomy_key: string | null; hide_expected: boolean }) =>
  apiJson<{ id: string; resumed: boolean }>("/api/stock-take", { method: "POST", body })

/** The session from the server (and cached), or the cached copy when offline. */
export async function loadSession(id: string, all = false): Promise<{ data: SessionData; offline: boolean }> {
  try {
    const data = await apiJson<SessionData>(withQuery(`/api/stock-take/${id}`, { all: all ? 1 : undefined }))
    await kvSet(sessionKey(id), data)
    return { data, offline: false }
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      const cached = await kvGet<SessionData>(sessionKey(id))
      if (cached) return { data: cached, offline: true }
    }
    throw err
  }
}

/** "Found something not on this list": own products from any shelf + catalogue. */
export async function searchSession(id: string, q: string): Promise<StockTakeItem[]> {
  const r = await apiJson<SessionData>(withQuery(`/api/stock-take/${id}`, { q }))
  return r.items
}

export async function getQueue(id: string): Promise<PendingQueue> {
  return (await kvGet<PendingQueue>(queueKey(id))) ?? EMPTY
}

/** Put edits in the queue (persisted) — sent by flushQueue. */
export async function enqueue(id: string, lines: LinePayload[], deletes: string[]): Promise<number> {
  const next = mergeQueue(await getQueue(id), lines, deletes)
  await kvSet(queueKey(id), next)
  const ids = (await kvGet<string[]>(PENDING_IDS)) ?? []
  if (!ids.includes(id)) await kvSet(PENDING_IDS, [...ids, id])
  return queueSize(next)
}

/**
 * Send what's queued for a session. Returns what's still waiting (0 = all
 * saved). A network failure keeps everything for next time; a finished
 * session (409) drops the queue — there's nothing left to save it to.
 */
export async function flushQueue(id: string): Promise<number> {
  const sent = await getQueue(id)
  if (queueSize(sent) === 0) return 0
  try {
    await apiJson(`/api/stock-take/${id}`, { method: "PUT", body: { lines: Object.values(sent.lines), delete_ids: sent.deletes } })
  } catch (err) {
    if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
      await clearQueue(id)
      throw err
    }
    return queueSize(sent)
  }
  const rest = settleQueue(await getQueue(id), sent)
  if (queueSize(rest) === 0) await clearQueue(id)
  else await kvSet(queueKey(id), rest)
  return queueSize(rest)
}

async function clearQueue(id: string) {
  await kvDelete(queueKey(id))
  const ids = (await kvGet<string[]>(PENDING_IDS)) ?? []
  await kvSet(PENDING_IDS, ids.filter((x) => x !== id))
}

/** On reconnect / app start: send every session's queued counts. */
export async function flushAllQueues(): Promise<void> {
  const ids = (await kvGet<string[]>(PENDING_IDS)) ?? []
  for (const id of ids) await flushQueue(id).catch(() => undefined)
}

export const previewSession = (id: string) => apiJson<Preview>(`/api/stock-take/${id}/post`, { method: "POST", body: { action: "preview" } })
export const postSession = (id: string) => apiJson<{ status: "posted" | "review"; reasons?: string[] }>(`/api/stock-take/${id}/post`, { method: "POST", body: { action: "post" } })
export const changeSession = (id: string, action: "cancel" | "reopen") => apiJson(`/api/stock-take/${id}`, { method: "PATCH", body: { action } })
