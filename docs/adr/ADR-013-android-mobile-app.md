# ADR-013 — Android app via React Native + WatermelonDB, bearer auth
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

**Local store**: WatermelonDB (SQLite-backed), not expo-sqlite/Drizzle. The actual
sync requirement turned out to be simple — a full-set catalogue refetch (existing
`GET /api/products/search?all=1&branch_id=`, capped 5000 rows) plus an idempotent
sale queue (existing `POST /api/sales`, dedupes on `offline_reference` — both
endpoints are unchanged, channel-agnostic already) — so a heavier sync engine
(PowerSync, ElectricSQL) isn't justified for v1. Mirrors the existing Dexie
algorithm in `apps/web/lib/offline/{db,sync}.ts` almost exactly, just backed by
SQLite instead of IndexedDB.

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
(cloud) producing a dev-client APK, since WatermelonDB's native module can't run
under plain Expo Go. CI gets a path-filtered `apps/mobile` typecheck/lint job
mirroring the existing `desktop-changes` pattern; no EAS build wired into CI yet —
triggered manually via the developer's own EAS account.

**Deferred, not decided blind**: thermal-printer library choice. The ESC-POS
Bluetooth-Classic library landscape is fragmented across every framework
evaluated; picking one without a real printer to test against would be guessing.
V1 ships an on-screen receipt only; printer integration is a follow-up once
hardware is in hand.

**Known risk, accepted deliberately — WatermelonDB on the New Architecture**:
React Native 0.82 (Oct 2025) removed the Legacy Architecture entirely — there is
no `newArchEnabled: false` opt-out on this Expo SDK/RN version, unlike when
WatermelonDB's Android JSI adapter first ran into trouble here. WatermelonDB's
old Android registration hook (`getJSIModulePackage()`) was removed from React
Native in 0.74 (Apr 2024); WatermelonDB's own changelog confirms the fix
(`WatermelonDBJSIPackage` registered via `getPackages()`), but neither Nozbe nor
Expo ship an official config plugin for it. We depend on a **third-party,
beta-tagged** plugin, `@morrowdigital/watermelondb-expo-plugin@2.4.0-beta.0`
(published Nov 2025, after the mandatory-New-Architecture cutover) — its source
was inspected directly and confirmed to implement the current, non-deprecated
registration pattern, not the broken pre-0.74 one. Pinned to this exact version
(no caret) rather than a range. If this plugin breaks on a future Expo/RN SDK
bump, the fallback is `expo prebuild` + hand-patching `MainApplication.kt`
directly, or migrating the local store to `expo-sqlite` + Drizzle (the
original, lower-risk alternative considered and set aside in favor of keeping
WatermelonDB).
