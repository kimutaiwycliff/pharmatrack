# ADR-017 — Platform insights for the operator console
**Status:** Accepted (2026-10-23)

## Context
The platform console managed subscriptions but said nothing about how each
pharmacy uses PharmaTrack, what they earn through it, or when they've
stopped — the signals needed to reach out before a tenant churns. Sign-in
history didn't exist: Better Auth deletes session rows on sign-out/expiry.

## Decision
- **Activity is recorded, once per person per pharmacy per Nairobi day**, in
  `user_activity_day` (migration 040): sign-ins (Better Auth
  `databaseHooks.session.create.after` — email, Google, PIN, phone app),
  plus ~5-minute "active" pings from open web/desktop windows
  (`ActivityPing` → `POST /api/activity`, only after a click/keypress),
  Android check-ins (`/api/mobile/me`) and offline-till uploads
  (`/api/sync/push`, the cashiers on the uploaded sales/shifts). Pings are
  throttled with the Redis limiter; recording never throws or blocks.
- **Money comes from existing tables, with full history**: sales, profit
  (same rule as Reports — line total minus sale-line/batch/product cost, on
  lines with a known cost) and stock value (unexpired stock at cost and at
  selling price, as Reports → Inventory). The operator sees all three by
  the owner's decision.
- **Health** (`lib/insights/health.ts`, pure, tested): healthy · getting
  started · slipping (4–7 days idle or sales halved) · at risk (8–14) ·
  inactive (14+) · never started (no sale 7+ days after signing up), with
  plain-sentence reasons. "Last active" = latest of activity, sale, device sync.
- **Follow-up log** in `platform_tenant_note` (kind, text, follow-up date);
  Call / WhatsApp / Email buttons open with a message for the situation.
- **Weekly digest** to `PLATFORM_NOTIFY_EMAIL` (else every platform admin):
  Monday from 07:00 Nairobi, once per ISO week (an `audit_log`
  `platform.digest` row), called hourly by the worker; `?force=1` previews.
- Both new tables are operator-only (RLS on, no tenant policy) and covered
  by the isolation suite.

## Consequences
- Sign-in and app-usage figures start on the deploy date; sales, profit,
  stock and milestones have full history.
- The operator console now shows each tenant's revenue, profit and stock —
  worth stating in the privacy notice/terms.
- Insights are computed live per request (a handful of grouped queries,
  `idx_sale_org_created`); if tenant count grows into the thousands, move
  the rollups to a nightly table.
