// Turns a /api/sync/push response into what happens to each outbox row
// (R1 rule 8). The server answers per item, in order:
//   synced | duplicate → done (mark synced)
//   rejected           → kept forever under "Needs attention" with the reason
//   retry              → left pending; the push loop stops here so the queue
//                        keeps its order (later batches aren't sent)
// The server still processed every item in the batch, so definitive answers
// for items AFTER a retry are applied too — they are the server's truth.

export type PushResult =
  | { client_id: string; status: "synced"; server_id: string; flags?: string[] }
  | { client_id: string; status: "duplicate"; server_id: string | null }
  | { client_id: string; status: "rejected"; code: string; message: string }
  | { client_id: string; status: "retry"; code: string; message: string }

export interface OutboxRef {
  seq: number
  client_id: string
}

export interface PushOutcome {
  synced: { seq: number; serverId: string | null; flags: string[] }[]
  rejected: { seq: number; code: string; message: string }[]
  /** first item the server asked us to retry (or didn't answer); null = batch fully settled */
  stoppedAt: { seq: number; code: string; message: string } | null
  retryCount: number
}

export function reducePushResults(batch: OutboxRef[], results: PushResult[]): PushOutcome {
  const out: PushOutcome = { synced: [], rejected: [], stoppedAt: null, retryCount: 0 }
  // Results come back in request order; fall back to matching by client_id in
  // case the server ever reorders or the lengths differ.
  const byId = new Map<string, PushResult>()
  for (const r of results) if (!byId.has(r.client_id)) byId.set(r.client_id, r)

  batch.forEach((item, i) => {
    const positional = results[i]
    const r = positional && positional.client_id === item.client_id ? positional : byId.get(item.client_id)
    const retry = (code: string, message: string) => {
      out.retryCount++
      if (!out.stoppedAt) out.stoppedAt = { seq: item.seq, code, message }
    }
    if (!r) return retry("no_result", "The server didn't answer for this item")
    switch (r.status) {
      case "synced":
        out.synced.push({ seq: item.seq, serverId: r.server_id, flags: r.flags ?? [] })
        break
      case "duplicate":
        out.synced.push({ seq: item.seq, serverId: r.server_id, flags: [] })
        break
      case "rejected":
        out.rejected.push({ seq: item.seq, code: r.code, message: r.message })
        break
      case "retry":
        retry(r.code, r.message)
        break
      default:
        retry("bad_result", "Unrecognised server answer")
    }
  })
  return out
}
