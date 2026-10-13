// Client side of the server's Idempotency-Key support (migration 031,
// apps/web/lib/api/idempotency.ts), shared by the web and Android apps.
//
// A submission's key = a per-form nonce + a hash of what's being sent:
//   - retrying the same form contents (after a timeout or dropped connection)
//     reuses the key, so the server replays the first answer instead of
//     creating a second batch / order;
//   - editing the form gives a new key, so the edit is really saved;
//   - after a successful save the caller retires the nonce, so deliberately
//     entering the same thing again later still creates a new record.

/** 32-bit FNV-1a over a string, as 8 hex chars. Not cryptographic — only tells payloads apart. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

/** Key for sending `payload` under form nonce `nonce` (8–100 chars of [A-Za-z0-9_.:-]). */
export function idempotencyKeyFor(nonce: string, payload: unknown): string {
  const safeNonce = nonce.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 60) || "n"
  return `k-${safeNonce}-${fnv1a(JSON.stringify(payload) ?? "")}`
}
