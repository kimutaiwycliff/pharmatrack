import "server-only"
import { eq } from "drizzle-orm"
import { dbAdmin, mpesa_stk_request } from "@pharmatrack/db"
import { getMpesaConfig } from "@/lib/mpesa/config"
import { stkQuery } from "@/lib/mpesa/daraja"
import { queryStillProcessing, stkOutcome } from "@/lib/mpesa/stk"

// Daraja allows a burst of ~3 STK Queries and ~30 a minute per app, so the
// till's 3-second poll reads our row and only this asks Safaricom — at most
// once per QUERY_EVERY_MS per request.
const QUERY_EVERY_MS = 10_000
/** The first few seconds the customer is still finding their phone. */
const FIRST_QUERY_AFTER_MS = 6_000

type Row = typeof mpesa_stk_request.$inferSelect

/**
 * Ask Safaricom how a pending request ended, if it's due a check, and save
 * the answer. Paid is only ever set from here (an STK Query), never from the
 * unsigned callback alone. Returns the (possibly updated) row.
 */
export async function refreshStkRequest(row: Row, opts: { force?: boolean } = {}): Promise<Row> {
  if (row.status !== "pending") return row
  const now = Date.now()
  const due = now - row.created_at.getTime() >= FIRST_QUERY_AFTER_MS &&
    (!row.last_checked_at || now - row.last_checked_at.getTime() >= QUERY_EVERY_MS)
  if (!due && !opts.force) return row

  const db = dbAdmin()
  const cfg = await getMpesaConfig(row.organization_id)
  if (!cfg) return row
  await db.update(mpesa_stk_request).set({ last_checked_at: new Date() }).where(eq(mpesa_stk_request.id, row.id))
  let data: Record<string, string>
  try {
    data = (await stkQuery(cfg, row.checkout_request_id)).data
  } catch {
    return row // network / auth hiccup — try again on a later poll
  }
  if (queryStillProcessing(data) || data.ResultCode === undefined) return { ...row, last_checked_at: new Date() }

  const outcome = stkOutcome(data.ResultCode, data.ResultDesc)
  if (outcome.status === "pending") return row
  const [updated] = await db.update(mpesa_stk_request)
    .set({ status: outcome.status, result_code: String(data.ResultCode), result_desc: data.ResultDesc ?? null, updated_at: new Date() })
    .where(eq(mpesa_stk_request.id, row.id))
    .returning()
  return updated ?? row
}
