# ADR-016 — Offline till for the browser and desktop app
**Status:** Accepted (2026-10-23)

## Context
The desktop app (ADR-012) loads the hosted site, so it already has every web
feature. Its offline mode was the browser's older one, which was much weaker
than the Android app's (ADR-013, sync R1):

- stock was never reserved, so an offline sale could later be refused after the customer had paid;
- shifts and PIN switching didn't work offline, and there was no receipt;
- sales were dated when they synced, not when they were sold;
- a signed-out session pushed queued sales into "rejected".

## Decision
A browser or desktop app can be **registered as a selling device**, using the
same `/api/devices/register` and `/api/sync/*` contract as Android. It then
runs `apps/web/lib/till`, an IndexedDB (Dexie) port of the Android engine:

- **Every sale is saved here first.** Online or offline, a sale is recorded on
  the computer in one transaction and uploads a few seconds later. That one
  transaction checks the computer's stock share, takes the next receipt number
  (`D01-YYMMDD-0001`), decrements stock and writes the outbox entry.
- **Same rules as Android.** It uses the same per-device stock share, midnight
  sync deadline, 12:00 manager unlock, clock-tamper guard and offline PIN
  switching (the server's bcrypt hash, 5 tries, then a 15-minute lockout).
- **Online top-up.** Online, a till that runs short of its share asks
  `/api/sync/allocate` for more before refusing the sale.
- **One shared core.** The pure sync logic now lives in
  `packages/core/src/sync` (`@pharmatrack/core/sync`), shared by both apps.
  Android's `src/lib/sync/core/*` files re-export it.
- **Shared receipts.** Receipts come from the local sale record, so they print
  offline and can be reprinted from the sync panel.
- **M-Pesa verification.** Confirmed after an STK prompt counts as verified; a
  code typed by hand is uploaded unverified, as on Android.

Unregistered browsers keep the older queue, with three fixes:
- they send `sold_at`, which `/api/sales` honours only together with
  `offline_reference`, never in the future and at most 30 days back;
- a 401 or 403 keeps sales queued instead of rejecting them;
- the cached stock goes down as offline sales are taken.

Protected `/api/*` routes now answer **401 JSON** instead of redirecting to
`/login`. A followed redirect could otherwise mark a queued sale as synced.

**Desktop shell (0.2.0):**
- The window opens a bundled launcher (`apps/desktop/launcher`), then goes to
  `/home`.
- The service worker (v2) saves `/pos` and its scripts when the till opens,
  and serves the saved till for `/`, `/home` and `/login` when offline.
- The tray gains a **Start with computer** toggle.
- `pt_notify` shows OS reminders at 21:00 and 23:30 while sales are waiting.

## Consequences
- **macOS.** WKWebView doesn't run service workers, so a Mac can't open the
  till from cold with no internet. The launcher waits and opens as soon as
  it's online. Once open, the till sells offline indefinitely, and closing the
  window only hides it. Windows (WebView2) opens the saved till from cold.
- **Stock shares can be held by unused devices.** A registered computer holds
  its share until the next day at noon, even if nobody uses it. Unused devices
  should be removed in Settings → Devices, and the POS error says so.
- **What stays online-only.** Back-office pages (reports, stock receiving,
  products) still need the internet; only the till is offline.
