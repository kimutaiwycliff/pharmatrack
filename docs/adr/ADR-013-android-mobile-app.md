# ADR-013 — Android app via React Native + expo-sqlite/Drizzle
**Status:** Accepted

**Supersedes** the "no native mobile app — PWA covers offline POS" line in
CLAUDE.md §12. The driver isn't a PWA gap — offline POS already works on web via
Dexie — it's reliable Bluetooth/USB ESC-POS thermal printer integration, which no
WebView wrapper (Capacitor, Tauri mobile) handles well, plus a real Play Store
presence for cashier devices.

**App shell**: React Native via Expo (New Architecture), not a WebView wrap of the
existing Next.js frontend. Chosen over Capacitor/Tauri-Android/Flutter/Kotlin
Multiplatform because Better Auth ships an official Expo client
(`expoClient()`/token storage), `react-native-vision-camera`/`expo-camera` give a
proven native barcode path, and `packages/core` (pure TS money/entitlements logic,
zero runtime deps) drops in unmodified via the pnpm workspace.

**Local store**: `expo-sqlite` + Drizzle (`drizzle-orm/expo-sqlite`) — the same
ORM already used server-side in `packages/db`, just against a local SQLite file
instead of Postgres. Two tables (`products`, `queued_sales`), no relations, no
migration framework — schema is created with a plain `CREATE TABLE IF NOT
EXISTS` in `src/db/database.ts`. The actual sync requirement turned out to be
simple — a full-set catalogue refetch (existing `GET /api/products/search?
all=1&branch_id=`, capped 5000 rows) plus an idempotent sale queue (existing
`POST /api/sales`, dedupes on `offline_reference` — both endpoints are
unchanged, channel-agnostic already) — so a heavier sync engine (PowerSync,
ElectricSQL) isn't justified for v1. Mirrors the existing Dexie algorithm in
`apps/web/lib/offline/{db,sync}.ts` almost exactly, just backed by SQLite
instead of IndexedDB.

**Superseded: WatermelonDB was the original choice, abandoned after two real
build failures, not a preference swap.** First, its Android JSI module only
works under the New Architecture (mandatory on this RN version, no opt-out)
via a third-party **beta** config plugin (`@morrowdigital/watermelondb-expo-
plugin`) — accepted as a documented risk at the time. Then an actual EAS build
failed with `expo-dev-menu-interface`'s Kotlin referencing a React Native
internal API (`ReactNativeFeatureFlags`) removed in RN 0.74 — traced to
`expo-dev-client` having been hand-pinned to a stale pre-SDK-57 version
(`~6.0.10` vs the correct `~57.0.10`; `expo-camera`, `expo-secure-store`, and
`@react-native-community/netinfo` had the same class of mistake, all fixed via
`expo install --fix`). With versions corrected, a second build failed for a
deeper reason: WatermelonDB's Android `CMakeLists.txt` hardcodes a relative
path to React Native's JSI C++ source
(`../../../../../../../react-native/ReactCommon/jsi/jsi/jsi.cpp`), assuming a
flat/hoisted `node_modules` layout (npm/yarn classic). pnpm's default
symlinked, content-addressed `node_modules` doesn't match that path structure,
and the build failed with `CMake Error: Cannot find source file`. An attempt
to fix this with a scoped `node-linker=hoisted` `.npmrc` for `apps/mobile`
made things worse (pnpm doesn't apply `node-linker` per-package within a
workspace — it needs a full, disruptive relink that broke the local install
entirely) and was reverted. Given pnpm is a foundational, pinned choice for
the whole monorepo (CLAUDE.md §3), the fix is switching the local store, not
the package manager.

**Auth**: added the `expo()` plugin to the shared `betterAuth()` config
(`apps/web/lib/auth/server.ts`), plus a `trustedOrigins: ["pharmatrack://"]`
entry. Not bearer tokens — `@better-auth/expo`'s client (verified by reading its
source directly) manages its own cookie jar in `expo-secure-store`: it captures
`Set-Cookie` from responses and manually replays the value as a `Cookie` header
on later requests, same as a browser would, plus an `expo-origin` header (RN has
no browser `Origin` header). The `expo()` server plugin's only job is rewriting
`expo-origin` → `origin` so `/sign-in/pin` and `/sign-in/email` pass Better
Auth's origin-trust check. Web cookie-based login is unaffected. For the app's
own business API calls (`/api/products/search`, `/api/sales` — not
`/api/auth/*`, so origin-trust doesn't apply there), the client attaches its
stored session via `authClient.getCookie()` as a plain `Cookie` header — the
mechanism the `@better-auth/expo` client itself exposes for exactly this case.
An earlier draft of this ADR also added Better Auth's `bearer()` plugin,
believing it was required; source inspection showed the official Expo client
never reads `set-auth-token` or sends `Authorization: Bearer` — it was dead code
and has been removed.

**Build/distribution**: no local Android Studio available — dev loop is EAS Build
(cloud) producing a dev-client APK, since `expo-sqlite` needs native code and
can't run under plain Expo Go. CI gets a path-filtered `apps/mobile`
typecheck/lint job mirroring the existing `desktop-changes` pattern; no EAS
build wired into CI yet — triggered manually via the developer's own EAS
account.

**Deferred, not decided blind**: thermal-printer library choice. The ESC-POS
Bluetooth-Classic library landscape is fragmented across every framework
evaluated; picking one without a real printer to test against would be guessing.
V1 ships an on-screen receipt only; printer integration is a follow-up once
hardware is in hand.
