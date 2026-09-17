# ADR-014 — Offline Edition: desktop + Android, zero-internet-forever, signed perpetual license
**Status:** Accepted

A second product line beside the hosted multi-tenant SaaS: single-tenant desktop
(Tauri) and Android (Expo) builds that work with zero internet connectivity
forever — including first-run setup — store all data (including auth) entirely
locally, carry no subscription (one-off perpetual license per client), and are
built/distributed outside the public landing page, since the operator installs
and sets up each client's device personally rather than selling self-serve.

**Desktop: a real Postgres binary bundled as a Tauri sidecar, not PGlite and not
a SQLite rewrite.** PGlite was rejected first — no reliable multi-role/`GRANT`/
`SET LOCAL` support, so the RLS+GUC pattern in `packages/db/src/tenant.ts` and
the whole RLS isolation suite couldn't be trusted to behave identically, an
unacceptable silent-regression risk for what is this codebase's one
non-negotiable security boundary (CLAUDE.md §2.1/§2.8). A SQLite rewrite was
rejected next — it would touch 22 migrations / 36 tables of Postgres-specific
SQL (`pg_trgm`, `numeric`, `jsonb`, sequences) for a one-off product line.
Bundling real Postgres means the entire existing Drizzle schema, RLS policies,
and inline business logic (FEFO, DUR, receipt sequence) run **completely
unmodified** against a local database — proven end-to-end (real `initdb` →
TCP-loopback-only start → role/extension bootstrap → all migrations via a
bundled `dbmate` sidecar → the Next.js standalone server → `/api/setup`), and
the RLS isolation suite re-run green against that exact bootstrap sequence.

**`OFFLINE_MODE` in `apps/web` is a single chokepoint, not scattered
conditionals.** `lib/offline-mode.ts`'s one flag gates: `haveIBeenPwned()` in
`lib/auth/server.ts`; `effectiveSubscriptionStatus()` short-circuiting to
`"active"`/`"enterprise"` (the only function `requireActiveSubscription()`/
`loadAppShell()` both consume); a `lib/storage/local-fs.ts` swapped in for
MinIO via a small factory, matching `minio.ts`'s exact function signatures;
and skipping the `@sentry/nextjs` import in `instrumentation.ts` (merely
importing it pulls in Next's OpenTelemetry auto-instrumentation, which writes
a generated shim file at runtime — fails inside a relocated app bundle, and
there's no internet to report errors to anyway). Investigation finding worth
recording: Redis, Resend email, Africa's Talking SMS, and M-Pesa already
degrade gracefully to a no-op when their own env vars/config are absent — this
was pre-existing behavior, not something built for this ADR, so the offline
build needs no extra gating for any of them; it simply never sets those vars.

**Android: full local SQLite schema + repository layer, not a reduced core
release.** The existing offline PIN path (`lib/device-users.ts`) only works
*after* one prior online login, disqualifying it for a true zero-internet
product. New `lib/local-auth.ts` is the PRIMARY (not cached-fallback) credential
store — a `staff` row with a locally-hashed PIN, created entirely on-device by
a first-run setup wizard, zero server contact ever. All ~15 remaining screens
(Products, Inventory, Sales, Appointments, Prescriptions, Staff, Dashboard,
Reports, Settings, the KEML catalog quick-seed, ...) were wired to a new
`src/repo/*.ts` layer that returns the exact same snake_case shapes the online
API already used, so existing screen state/JSX needed no rewriting — only each
`apiFetch` call site gained an `if (env.EXPO_PUBLIC_OFFLINE_MODE)` branch.
FEFO batch-decrement logic was ported line-for-line from
`apps/web/app/api/sales/route.ts`; DUR's pure matching logic
(`tokens`/`baseName`/`overlap`/`checkDur`) was extracted into
`packages/core/src/dur.ts` so both apps share one implementation, with only
the DB I/O gathering rows differing per app. No Android emulator exists in
this build environment, so all of this verification has been `tsc`/`eslint`
only — **a real device/emulator airplane-mode pass is still required before
shipping**, tracked as this ADR's own open item (see Verification below).

**Licensing: a signed offline Ed25519 license file, not a baked-in master
password.** Chosen specifically because a password embedded in either binary
is recoverable by decompiling it; a public-key signature is not. The private
key is generated and held only by the operator
(`scripts/generate-offline-license.mjs`, zero new Node dependencies), written
to a gitignored `secrets/` directory as a convenience default and expected to
move to a password manager or offline drive from there — it must never be
committed and never becomes a CI secret. The license envelope
(`{version, payload, signature}`, signature as raw-Ed25519 hex over the
literal payload string, no canonical-JSON step for either verifier to get
wrong) is checked as the literal first step before anything else runs: on
desktop, before Postgres or the Next.js server are even spawned (via
`tauri-plugin-dialog`'s native file picker — no webview exists yet to host a
custom UI at that point); on mobile, before `isFirstRun()` is even checked, so
an unlicensed device can't reach the setup wizard. Both platforms **re-verify
the stored license's signature on every launch**, not just once — a cached
"already licensed" boolean would be trivial to fake by editing local app
state, whereas the signature check itself is the actual guard. Accepted
tradeoff, stated explicitly rather than a gap to silently fix later: this
doesn't bind a license to specific hardware, so a leaked `.ptlicense` file
alone could unlock one extra copy. Hardware-ID binding is a future stretch
only if this becomes a real problem in practice.

**Distribution: a separate R2 bucket and a manual-only CI workflow, kept off
the public site.** `.github/workflows/offline-release.yml` is
`workflow_dispatch`-only, uploads to a distinct `pharmatrack-offline-releases`
bucket (own credentials, own repo secrets — `R2_OFFLINE_*`, never
`R2_*`/`R2_ACCESS_KEY_ID` shared with the public release jobs), and is never
referenced by the landing page's download components or the public
`latest.json`. It deliberately does **not** sign license files itself, even
though this was originally scoped as one workflow step — doing so would
require the signing private key as a CI secret, reintroducing exactly the
"key lives on infrastructure the operator doesn't fully control" risk the
licensing design above exists to avoid (a compromised runner or a leaked repo
secret could otherwise forge unlimited valid licenses). The workflow builds
and uploads installers/APKs only; its job summary prints the exact local
`sign` + `aws s3 cp` commands for the operator to run on their own machine.

**Known, deliberately accepted gaps (not oversights):**
- No hardware binding on licenses (see above).
- The mobile DUR interaction reference set (`apps/mobile/src/data/
  dur-interactions.ts`, ~45 pairs) is authored directly, not ported — the
  online `drug_interaction` table has no seed data of its own either (the
  migration only creates the table; nothing has ever inserted into it in this
  codebase). Not a substitute for a licensed interaction-checker database.
- The mobile KEML catalog quick-seed uses the original ~95-row identity-only
  KEML/PPB set (`infra/migrations/007_drug_catalog_seed.sql`), not the
  larger enriched retail catalogue added by later migrations — that
  enrichment's pricing data isn't available to bundle offline, so seeded
  products are created inactive/unpriced pending manual review, rather than
  active/priced like the current online route.
- `offline-release.yml` has not yet been exercised by a real
  `workflow_dispatch` run (real Windows/macOS runners, real EAS cloud build,
  real R2 write) — only YAML-parsed for syntax and cross-checked line-by-line
  against the already-proven Phase 1 local build sequence and the already-
  working public `ci.yml` release jobs.

## Verification

Still open, blocking a real client install — not yet performable in this
build environment (no Android emulator, no spare machine to fully air-gap):

- **Desktop**: install on a clean VM with networking disabled from first
  boot; confirm setup requires a valid license file and completes with zero
  network calls; re-run the RLS isolation suite against the bundled Postgres;
  walk a full POS sale → receipt → inventory decrement → report, fully
  offline.
- **Android**: install the APK on a device in airplane mode from first
  launch (verify with a network monitor/proxy that the setup wizard makes no
  calls); walk the full feature set offline — POS, inventory receive/adjust,
  appointments, prescriptions (a known interacting drug pair should still
  trip DUR locally), staff PIN management, reports, the KEML quick-seed.
- Dispatch a real `offline-release.yml` run end-to-end, then sign and hand-
  install a real license file, confirming the whole chain from CI artifact to
  a running, licensed, offline install.
- Confirm (already true by construction, re-check after any future change)
  that neither offline build is reachable from the public landing page's
  download components or its public `latest.json`.
