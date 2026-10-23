import { quantitiesByProduct, type PushItemPayload, type SalePayload } from "@pharmatrack/core/sync"
import { tillDB, type OutboxRow, type OutboxStatus, type TillDB } from "./db"

// Outbox access — the web twin of apps/mobile/src/lib/sync/outbox.ts. Writes
// happen inside the same Dexie transaction as the business change they
// record (call these from within db.transaction("rw", …)).

export async function enqueue(key: string, item: PushItemPayload, summary: string, db: TillDB = tillDB()): Promise<void> {
  await db.outbox.add({
    key, client_id: item.client_id, type: item.type, payload: item, summary, status: "pending",
    error_code: null, error_message: null, server_id: null, flags: null, attempts: 0, created_at: Date.now(), synced_at: null,
  })
}

export async function pendingBatch(limit: number, db: TillDB = tillDB()): Promise<OutboxRow[]> {
  const rows = await db.outbox.where("status").equals("pending").sortBy("seq")
  return rows.slice(0, limit)
}

export async function listOutbox(status: OutboxStatus, limit = 200, db: TillDB = tillDB()): Promise<OutboxRow[]> {
  const rows = await db.outbox.where("status").equals(status).sortBy("seq")
  return status === "synced" ? rows.reverse().slice(0, limit) : rows.slice(0, limit)
}

export interface OutboxCounts {
  pending: number
  pendingSales: number
  rejected: number
  pendingShiftCloses: number
}

export async function outboxCounts(db: TillDB = tillDB()): Promise<OutboxCounts> {
  const [pending, pendingSales, pendingShiftCloses, rejected] = await Promise.all([
    db.outbox.where("status").equals("pending").count(),
    db.outbox.where("[status+type]").equals(["pending", "sale"]).count(),
    db.outbox.where("[status+type]").equals(["pending", "shift_close"]).count(),
    db.outbox.where("status").equals("rejected").count(),
  ])
  return { pending, pendingSales, rejected, pendingShiftCloses }
}

/** Base units per product still waiting to upload (the server hasn't subtracted them yet). */
export async function pendingSaleQuantities(db: TillDB = tillDB()): Promise<Map<string, number>> {
  const rows = await db.outbox.where("[status+type]").equals(["pending", "sale"]).toArray()
  return quantitiesByProduct(rows.map((r) => r.payload as SalePayload))
}

export async function markSynced(seq: number, serverId: string | null, flags: string[], db: TillDB = tillDB()): Promise<void> {
  await db.outbox.update(seq, {
    status: "synced", server_id: serverId, flags: flags.length ? flags : null, error_code: null, error_message: null, synced_at: Date.now(),
  })
}

export async function markRejected(seq: number, code: string, message: string, db: TillDB = tillDB()): Promise<void> {
  await db.outbox.update(seq, { status: "rejected", error_code: code, error_message: message })
}

export async function noteRetry(seq: number, code: string, message: string, db: TillDB = tillDB()): Promise<void> {
  await db.outbox.update(seq, { error_code: code, error_message: message })
}

export async function bumpAttempts(seqs: number[], db: TillDB = tillDB()): Promise<void> {
  if (seqs.length === 0) return
  await db.outbox.where("seq").anyOf(seqs).modify((r) => { r.attempts += 1 })
}

/** "Needs attention" → dismissed, once someone recorded it by hand. Never deleted. */
export async function dismissRejected(seq: number, db: TillDB = tillDB()): Promise<void> {
  await db.outbox.where("seq").equals(seq).and((r) => r.status === "rejected").modify({ status: "dismissed" })
}

/** Client ids of shift_open items the server refused (dependent items must not wait on them forever). */
export async function refusedShiftIds(db: TillDB = tillDB()): Promise<Set<string>> {
  const rows = await db.outbox.where("type").equals("shift_open").and((r) => r.status === "rejected" || r.status === "dismissed").toArray()
  return new Set(rows.map((r) => r.client_id))
}

/** Synced history older than this is trimmed so the browser's storage doesn't grow forever. */
const KEEP_SYNCED_MS = 30 * 24 * 3_600_000

export async function trimSynced(db: TillDB = tillDB(), now = Date.now()): Promise<number> {
  return db.outbox.where("status").equals("synced").and((r) => (r.synced_at ?? r.created_at) < now - KEEP_SYNCED_MS).delete()
}
