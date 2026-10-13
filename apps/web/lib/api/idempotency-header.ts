// Shared by the server helper (./idempotency.ts) and client forms
// (./useIdempotencyKey.ts) without pulling server imports into the browser.
export const IDEMPOTENCY_HEADER = "Idempotency-Key"
