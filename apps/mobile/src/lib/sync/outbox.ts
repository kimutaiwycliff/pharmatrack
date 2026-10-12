import { sqlite } from "../../db/database"
import type { PushItemPayload, SalePayload } from "./core/payload"
import { quantitiesByProduct } from "./core/payload"

// Outbox access. Synchronous on purpose: inserts happen inside the same
// sqlite.withTransactionSync() as the business write they record (sale,
// shift open/close, override), so the two can never disagree.

export interface OutboxRecord {
  seq: number
  clientId: string
  type: string
  payload: string
  summary: string | null
  status: "pending" | "synced" | "rejected" | "dismissed"
  errorCode: string | null
  errorMessage: string | null
  serverId: string | null
  flags: string | null
  attempts: number
  createdAt: number
  syncedAt: number | null
}

const SELECT = `SELECT seq, client_id AS clientId, type, payload, summary, status, error_code AS errorCode,
  error_message AS errorMessage, server_id AS serverId, flags, attempts, created_at AS createdAt, synced_at AS syncedAt
  FROM outbox`

/** Must be called inside a transaction together with the write it records. */
export function enqueue(rowKey: string, item: PushItemPayload, summary: string): void {
  sqlite.runSync(
    "INSERT INTO outbox (client_id, type, payload, summary, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
    [rowKey, item.type, JSON.stringify(item), summary, Date.now()],
  )
}

export function pendingBatch(limit: number): OutboxRecord[] {
  return sqlite.getAllSync<OutboxRecord>(`${SELECT} WHERE status = 'pending' ORDER BY seq LIMIT ?`, [limit])
}

export function listOutbox(status: OutboxRecord["status"], limit = 200): OutboxRecord[] {
  const order = status === "synced" ? "DESC" : "ASC"
  return sqlite.getAllSync<OutboxRecord>(`${SELECT} WHERE status = ? ORDER BY seq ${order} LIMIT ?`, [status, limit])
}

export interface OutboxCounts {
  pending: number
  pendingSales: number
  rejected: number
  pendingShiftCloses: number
}

export function outboxCounts(): OutboxCounts {
  const rows = sqlite.getAllSync<{ status: string; type: string; n: number }>(
    "SELECT status, type, count(*) AS n FROM outbox WHERE status IN ('pending', 'rejected') GROUP BY status, type",
  )
  const c: OutboxCounts = { pending: 0, pendingSales: 0, rejected: 0, pendingShiftCloses: 0 }
  for (const r of rows) {
    if (r.status === "pending") {
      c.pending += r.n
      if (r.type === "sale") c.pendingSales += r.n
      if (r.type === "shift_close") c.pendingShiftCloses += r.n
    } else {
      c.rejected += r.n
    }
  }
  return c
}

/** Base units per product still waiting to upload (the server hasn't subtracted them yet). */
export function pendingSaleQuantities(): Map<string, number> {
  const rows = sqlite.getAllSync<{ payload: string }>("SELECT payload FROM outbox WHERE status = 'pending' AND type = 'sale'")
  const sales: SalePayload[] = []
  for (const r of rows) {
    try {
      sales.push(JSON.parse(r.payload) as SalePayload)
    } catch {
      // unreadable payload — it will surface as rejected when pushed
    }
  }
  return quantitiesByProduct(sales)
}

export function markSynced(seq: number, serverId: string | null, flags: string[]): void {
  sqlite.runSync(
    "UPDATE outbox SET status = 'synced', server_id = ?, flags = ?, error_code = NULL, error_message = NULL, synced_at = ? WHERE seq = ?",
    [serverId, flags.length ? JSON.stringify(flags) : null, Date.now(), seq],
  )
}

export function markRejected(seq: number, code: string, message: string): void {
  sqlite.runSync("UPDATE outbox SET status = 'rejected', error_code = ?, error_message = ? WHERE seq = ?", [code, message, seq])
}

export function noteRetry(seq: number, code: string, message: string): void {
  sqlite.runSync("UPDATE outbox SET error_code = ?, error_message = ? WHERE seq = ?", [code, message, seq])
}

export function bumpAttempts(seqs: number[]): void {
  if (seqs.length === 0) return
  sqlite.runSync(`UPDATE outbox SET attempts = attempts + 1 WHERE seq IN (${seqs.map(() => "?").join(",")})`, seqs)
}

/** "Needs attention" → dismissed. Only after the user confirmed it was recorded manually; never deleted. */
export function dismissRejected(seq: number): void {
  sqlite.runSync("UPDATE outbox SET status = 'dismissed' WHERE seq = ? AND status = 'rejected'", [seq])
}

/** Client ids of shift_open items the server refused (dependent items must not wait on them forever). */
export function refusedShiftIds(): Set<string> {
  const rows = sqlite.getAllSync<{ clientId: string }>(
    "SELECT client_id AS clientId FROM outbox WHERE type = 'shift_open' AND status IN ('rejected', 'dismissed')",
  )
  return new Set(rows.map((r) => r.clientId))
}
