"use client"

import { useMemo, useRef } from "react"
import { idempotencyKeyFor } from "@pharmatrack/core"
import { IDEMPOTENCY_HEADER } from "./idempotency-header"

const newNonce = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`

/**
 * Per-form Idempotency-Key source (see @pharmatrack/core idempotency.ts):
 * `headerFor(payload)` gives the header to send — the same contents retried
 * reuse the key, edited contents get a new one — and `reset()` after a
 * successful save so entering the same thing again later is a new record.
 */
export function useIdempotencyKey() {
  const nonce = useRef<string | null>(null)
  return useMemo(
    () => ({
      headerFor(payload: unknown): Record<string, string> {
        nonce.current ??= newNonce()
        return { [IDEMPOTENCY_HEADER]: idempotencyKeyFor(nonce.current, payload) }
      },
      reset() {
        nonce.current = null
      },
    }),
    [],
  )
}
