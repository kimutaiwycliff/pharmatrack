import { apiFetch, REQUEST_TIMEOUT_MS } from "./api-fetch"
import { env } from "./env"
import { httpMessage, TIMEOUT_ERROR, userMessage, withTimeout } from "./errors"

export interface MpesaAvailability {
  available: boolean
  planAllowed: boolean
  configured: boolean
  /** The check itself failed (no connection, timeout, server error) — worth retrying. */
  failed?: boolean
}

// Mirrors GET /api/mpesa/available (apps/web/app/api/mpesa/available/route.ts)
// and the web POS's fallback behavior for it (apps/web/app/(pos)/pos/page.tsx's
// mpesaAvail query: any non-ok response -> { available: false }). Any failure
// here (auth, network, server error) is treated as "not available" rather than
// surfaced as an error — the POS just doesn't offer M-Pesa/Split; Cash still works.
// `failed` marks those so the POS can retry and say why the tabs are missing.
export async function fetchMpesaAvailability(): Promise<MpesaAvailability> {
  // ADR-014: no internet at all in the Offline Edition build, so STK push is
  // never possible — same shape the online app already treats as "not
  // available" (Cash-only POS), just skipping the doomed network call.
  if (env.EXPO_PUBLIC_OFFLINE_MODE) return { available: false, planAllowed: false, configured: false }
  try {
    // apiFetch limits the wait for headers; the body read is limited too.
    const res = await apiFetch("/api/mpesa/available")
    if (!res.ok) return { available: false, planAllowed: false, configured: false, failed: true }
    const body = (await withTimeout(res.json() as Promise<unknown>, REQUEST_TIMEOUT_MS).catch(() => null)) as Partial<MpesaAvailability> | null
    if (!body) return { available: false, planAllowed: false, configured: false, failed: true }
    return {
      available: !!body?.available,
      planAllowed: !!body?.planAllowed,
      configured: !!body?.configured,
    }
  } catch {
    return { available: false, planAllowed: false, configured: false, failed: true }
  }
}

export interface StkPushResult {
  ok: boolean
  error: string | null
}

// POST /api/mpesa (apps/web/app/api/mpesa/route.ts) fires an STK push using the
// tenant's own Daraja credentials. `amount` is decimal KES — the portion being
// paid via M-Pesa (full total for a pure M-Pesa sale, the M-Pesa share for split).
//
// There is no status-polling endpoint anywhere in this system: a 200 here only
// means Safaricom accepted the push request, not that the customer has paid.
// See components/MpesaFlow.tsx for the client-side-only wait/confirm flow that
// mirrors apps/web/components/pos/MpesaModal.tsx's real (un-fixed) UX.
//
// Deliberate fix vs. the web client: apps/web/components/pos/MpesaModal.tsx's
// sendSTK() only inspects a parsed `.error` field and never checks `res.ok` —
// a non-JSON-shaped Daraja failure passthrough (502, raw Daraja error body with
// no `.error` key) fools it into treating the push as sent. This checks
// `res.ok` first, so an unrecognized failure body still counts as a failure.
//
// apiFetch gives up after REQUEST_TIMEOUT_MS. Errors are plain sentences (the
// server's own text for 4xx, never "HTTP 502"); a timeout says the prompt MAY
// have gone out, since Safaricom could have accepted it before we gave up.
export const STK_FAILED = "Could not send the M-Pesa prompt. Check the number and try again."
export const STK_TIMEOUT = `${TIMEOUT_ERROR} The prompt may still reach the customer — ask before resending.`

export async function sendStkPush(phone: string, amount: number): Promise<StkPushResult> {
  try {
    const res = await apiFetch("/api/mpesa", {
      method: "POST",
      body: JSON.stringify({ phone, amount, accountReference: "PHARMATRACK" }),
    })
    if (!res.ok) {
      const body = (await withTimeout(res.json() as Promise<unknown>, REQUEST_TIMEOUT_MS).catch(() => null)) as { error?: unknown } | null
      const serverText = typeof body?.error === "string" ? body.error : null
      // 5xx: Daraja / our server failed — the server text is rarely for people.
      return { ok: false, error: res.status >= 500 ? STK_FAILED : httpMessage(res.status, serverText) }
    }
    return { ok: true, error: null }
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return { ok: false, error: STK_TIMEOUT }
    return { ok: false, error: userMessage(err, STK_FAILED) }
  }
}
