import { apiFetch } from "./api-fetch"
import { env } from "./env"

export interface MpesaAvailability {
  available: boolean
  planAllowed: boolean
  configured: boolean
}

// Mirrors GET /api/mpesa/available (apps/web/app/api/mpesa/available/route.ts)
// and the web POS's fallback behavior for it (apps/web/app/(pos)/pos/page.tsx's
// mpesaAvail query: any non-ok response -> { available: false }). Any failure
// here (auth, network, server error) is treated as "not available" rather than
// surfaced as an error — the POS just doesn't offer M-Pesa/Split; Cash still works.
export async function fetchMpesaAvailability(): Promise<MpesaAvailability> {
  // ADR-014: no internet at all in the Offline Edition build, so STK push is
  // never possible — same shape the online app already treats as "not
  // available" (Cash-only POS), just skipping the doomed network call.
  if (env.EXPO_PUBLIC_OFFLINE_MODE) return { available: false, planAllowed: false, configured: false }
  try {
    const res = await apiFetch("/api/mpesa/available")
    if (!res.ok) return { available: false, planAllowed: false, configured: false }
    const body = (await res.json().catch(() => null)) as Partial<MpesaAvailability> | null
    return {
      available: !!body?.available,
      planAllowed: !!body?.planAllowed,
      configured: !!body?.configured,
    }
  } catch {
    return { available: false, planAllowed: false, configured: false }
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
export async function sendStkPush(phone: string, amount: number): Promise<StkPushResult> {
  try {
    const res = await apiFetch("/api/mpesa", {
      method: "POST",
      body: JSON.stringify({ phone, amount, accountReference: "PHARMATRACK" }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null
      const message = typeof body?.error === "string" ? body.error : `M-Pesa request failed (HTTP ${res.status})`
      return { ok: false, error: message }
    }
    return { ok: true, error: null }
  } catch {
    return { ok: false, error: "Network error — couldn't reach the server. Check your connection and try again." }
  }
}
