// ADR-014 — Offline Edition builds (bundled local Postgres, no internet ever)
// run with OFFLINE_MODE=true. This is the single flag every network-dependent
// or billing-dependent code path checks: HIBP breach-check (auth/server.ts),
// subscription/billing gating (auth/helpers.ts, auth/app-shell.ts), and object
// storage (lib/storage/index.ts, MinIO → local disk). Everything else that
// depends on an optional external service (Resend email, Africa's Talking SMS,
// M-Pesa, Redis) already degrades gracefully when its own env vars are unset,
// so an Offline Edition deploy simply never sets them — no extra gating needed.
export const OFFLINE_MODE = process.env.OFFLINE_MODE === "true"
