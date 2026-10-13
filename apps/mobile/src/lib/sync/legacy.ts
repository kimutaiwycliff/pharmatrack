import { sqlite } from "../../db/database"
import { apiFetch } from "../api-fetch"
import { httpMessage } from "../errors"
import { getCookie } from "../auth-client"
import { kvGetSync, kvSetSync } from "../kv"

// R1 rule 12 — sales queued by the pre-R1 app (queued_sales, POSTed to
// /api/sales with the staff cookie) are flushed ONCE through that old path
// if a session exists. Whatever can't be uploaded — rejected before, rejected
// now, or no session to send it with — moves to "Needs attention" as a
// `legacy_sale` outbox row. Nothing is ever dropped: the queued_sales rows
// stay too, marked with where they went.

const DONE_KEY = "legacy_queue_migrated"

interface QueuedRow {
  id: number
  offlineReference: string
  payload: string
  status: string
  errorMessage: string | null
  createdAt: number
}

function moveToNeedsAttention(rows: QueuedRow[]) {
  sqlite.withTransactionSync(() => {
    for (const r of rows) {
      let summary = "Sale from the previous app version"
      try {
        const p = JSON.parse(r.payload) as { items?: { product_name?: string; quantity?: number }[] }
        const items = (p.items ?? []).map((i) => `${i.quantity ?? "?"}× ${i.product_name ?? "item"}`).join(", ")
        if (items) summary = `Older sale · ${items}`.slice(0, 160)
      } catch {
        // keep the generic summary
      }
      sqlite.runSync(
        `INSERT OR IGNORE INTO outbox (client_id, type, payload, summary, status, error_code, error_message, created_at)
         VALUES (?, 'legacy_sale', ?, ?, 'rejected', 'legacy_unsynced', ?, ?)`,
        [
          `legacy-${r.offlineReference}`,
          r.payload,
          summary,
          r.errorMessage
            ? `The server refused this sale: ${r.errorMessage}. Record it manually on the web.`
            : "Recorded by an older version of the app and couldn't be uploaded automatically. Record it manually on the web.",
          r.createdAt,
        ],
      )
      sqlite.runSync("UPDATE queued_sales SET status = 'rejected', error_message = ? WHERE id = ?", [
        `${r.errorMessage ? `${r.errorMessage} — ` : ""}moved to Needs attention`,
        r.id,
      ])
    }
  })
}

/** Safe to call on every sync: does nothing once the old queue is settled. */
export async function migrateLegacyQueue(): Promise<void> {
  if (kvGetSync<boolean>(DONE_KEY)) return
  const select = `SELECT id, offline_reference AS offlineReference, payload, status, error_message AS errorMessage, created_at AS createdAt
    FROM queued_sales WHERE status = ? ORDER BY created_at`
  const pending = sqlite.getAllSync<QueuedRow>(select, ["pending"])

  if (pending.length > 0 && getCookie()) {
    for (const row of pending) {
      let res: Response
      try {
        res = await apiFetch("/api/sales", { method: "POST", body: row.payload })
      } catch {
        return // offline — try again on the next sync, nothing decided yet
      }
      if (res.ok) {
        const body = await res.json().catch(() => null)
        sqlite.runSync("UPDATE queued_sales SET status = 'synced', server_response = ? WHERE id = ?", [body ? JSON.stringify(body) : null, row.id])
      } else if (res.status === 429 || res.status >= 500) {
        return // server busy — retry later, keeping order
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        sqlite.runSync("UPDATE queued_sales SET status = 'rejected', error_message = ? WHERE id = ?", [httpMessage(res.status, err.error), row.id])
      }
    }
  }

  // Everything still pending (no session) or rejected goes to Needs attention.
  const leftover = [...sqlite.getAllSync<QueuedRow>(select, ["pending"]), ...sqlite.getAllSync<QueuedRow>(select, ["rejected"])]
    .filter((r) => !(r.errorMessage ?? "").includes("moved to Needs attention"))
  if (leftover.length > 0) moveToNeedsAttention(leftover)
  kvSetSync(DONE_KEY, true)
}
