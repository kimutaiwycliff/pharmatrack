import * as Crypto from "expo-crypto"
import { useMemo, useRef } from "react"
import { idempotencyKeyFor } from "@pharmatrack/core"

// Per-form Idempotency-Key source for stock-creating writes (server:
// apps/web/lib/api/idempotency.ts). `headerFor(payload)` gives the header —
// the same contents retried (after a timeout or dropped connection) reuse the
// key, so the server replays the first answer instead of booking stock twice;
// edited contents get a new key. Call `reset()` after a successful save so the
// same thing entered again later is a new record. Mirrors the web hook.
export function useIdempotencyKey() {
  const nonce = useRef<string | null>(null)
  return useMemo(
    () => ({
      headerFor(payload: unknown): Record<string, string> {
        nonce.current ??= Crypto.randomUUID()
        return { "Idempotency-Key": idempotencyKeyFor(nonce.current, payload) }
      },
      reset() {
        nonce.current = null
      },
    }),
    [],
  )
}
