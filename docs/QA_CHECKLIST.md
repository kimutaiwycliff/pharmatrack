# PharmaTrack — Manual QA / Test Checklist

A full manual pass for verifying the platform end-to-end. Tick each box. Test in **two browser profiles** where roles matter (e.g. one platform admin, one pharmacy owner), and on **desktop + a phone-width window** for responsiveness.

> **Known limitation:** the POS is **not** offline-ready yet (scaffolding only). Do **not** test "selling while offline" as a passing scenario.

Legend: ⬜ = to test · 🔴 = blocker · 🟡 = minor

---

## 0. Environment & build
- [ ] `pnpm install` succeeds
- [ ] `pnpm --filter web typecheck` passes
- [ ] `pnpm --filter web lint` passes
- [ ] `pnpm --filter web test` passes
- [ ] `pnpm --filter web build` succeeds; `.next/standalone/apps/web/server.js` exists
- [ ] `GET /api/health` returns `{ status: "ok" }` (200, no auth needed)
- [ ] CI is green on the latest push (GitHub Actions)
- [ ] Docker image builds (`docker compose build`) and container passes its healthcheck

## 1. Authentication
- [ ] Sign in with email + password → lands on the right home (owner/manager → Dashboard; pharmacist/cashier → POS)
- [ ] Wrong password shows a clear error
- [ ] **PIN login**: phone + 4-digit PIN works; wrong PIN rejected
- [ ] **Forgot password** → email received → link opens `/auth/set-password` → new password works → can sign in
- [ ] **Invite** (new staff/owner) → email link → set password → signed in
- [ ] Expired/invalid auth link → redirected to `/login?error=...` (no crash)
- [ ] Signing out returns to `/login`; protected pages redirect to `/login` when logged out

## 2. Roles & access control
- [ ] Cashier is sent to POS and cannot reach Dashboard/Reports/Settings
- [ ] Pharmacist cannot reach Staff/Reports/Settings; can reach Inventory/Products/Appointments
- [ ] Manager can reach Staff & Reports; cannot reach owner-only Settings actions
- [ ] Direct-URL access to a forbidden page/API returns 403 / redirects (not data leakage)
- [ ] A user from Org A can never see Org B's data (multi-tenant isolation)

## 3. Platform console (`/platform`) — SaaS operator
- [ ] Non–platform-admin visiting `/platform` is redirected to `/dashboard`
- [ ] Platform admin logs in and lands on `/platform`
- [ ] Tenant list shows pharmacies with plan, status, paid-until, branch/staff counts; metrics strip correct
- [ ] **Add pharmacy**: creates org + sends owner invite + seeds subscription, branch & services
- [ ] Tenant detail: change **plan**, **status**, **paid-until**, **trial** → saves
- [ ] **Suspend** a tenant → Save
- [ ] **Record payment** (with "covers until") → activates + extends paid-until; appears in history

## 4. Subscription gating
- [ ] After suspending a tenant, its **owner/staff** see the "Access paused" screen (dashboard & POS)
- [ ] Owner sees "contact PharmaTrack"; staff see "ask your owner"
- [ ] Reactivating (status → active) restores full access
- [ ] Trialing/active tenants are unaffected

## 5. POS / till
- [ ] **Clock in** with opening float starts a shift
- [ ] Product **search** by name returns results; tap adds to cart
- [ ] Barcode/GS1 **scan** adds the right product
- [ ] Cart: change quantity, remove line, apply **discount** (within max) — total recalculates
- [ ] Discount above a product's max is blocked
- [ ] **Cash** payment: enter tendered → correct change shown → sale completes
- [ ] **M-Pesa**: STK push reaches the phone; on approval the sale records with reference (needs `MPESA_*`)
- [ ] **Split** payment records the correct cash/M-Pesa amounts
- [ ] **Receipt** prints / saves as PDF; optional customer name/phone captured
- [ ] Stock decrements after a sale (check Inventory)
- [ ] **Clock out** with closing cash → variance shown
- [ ] Selling a **controlled substance** writes to the controlled-substances log

## 6. Inventory & stock
- [ ] **Stock Receive**: product + batch number + expiry + qty + cost saves; stock increases for the active branch
- [ ] Inventory filters work: out-of-stock, low-stock, expiring, controlled
- [ ] Summary chips (out/low/expiring/controlled) show correct counts
- [ ] Batch view shows quantities and earliest expiry
- [ ] Switching **active branch** changes the stock shown

## 7. Products & catalogue
- [ ] **Add product** (centered dialog, blurred backdrop) with all fields saves
- [ ] **Edit product** opens the *correct* product; switching to another product shows the new one (no stale data)
- [ ] Edit dialog is centered with a glassy backdrop
- [ ] Editing & saving a product (with a relative seeded image) succeeds — **no "Invalid"** error
- [ ] **Categories** (two-level) create/edit/delete; products filter by category
- [ ] **Pack sizes** add/edit/deactivate with own price/barcode
- [ ] **Default supplier** + **max discount %** save and show
- [ ] Deactivate/reactivate a product; inactive hidden from POS

## 8. Suppliers
- [ ] Add / edit / deactivate a supplier
- [ ] Deactivated supplier drops out of product/stock dropdowns but history remains

## 9. Appointments & reminders
- [ ] **Book**: new customer creates a record; existing customer found via autocomplete
- [ ] Appears under Today/Upcoming correctly; Past shows history
- [ ] Status actions: Confirm / Complete / No-show / Cancel update the badge
- [ ] **Recurring service** (e.g. Depo) completed → next-dose dialog pre-filled at the right interval
- [ ] **Messaging opt-in** toggle saves per customer; off = no reminders queued
- [ ] **Settings → Services**: add / edit (label + repeat weeks) / deactivate; booking dropdown reflects changes
- [ ] Reminder rows are created on booking (verify in DB) for opted-in customers
- [ ] Cron `GET /api/cron/appointment-reminders` **without** `CRON_SECRET` → 401
- [ ] Cron **with** secret: due reminders send (SMS/email when providers set) or mark `skipped` when not; rows flip to `sent`/`skipped`
- [ ] Opted-out / cancelled appointments are skipped by the cron

## 10. Reports
- [ ] Sales, inventory and financial reports load with correct numbers
- [ ] Date/branch filters work; charts render (light & dark)

## 11. Staff & shifts
- [ ] Invite staff (role + branch) → invite email sent
- [ ] Deactivate/reactivate staff
- [ ] Shifts list shows takings, opening float, closing cash & variance per session

## 12. Settings
- [ ] **Organization**: edit name/contacts/logo (owner)
- [ ] **Branches**: add/edit/deactivate
- [ ] **Services**: (covered in §9)
- [ ] **Billing**: shows plan/status/paid-until; payment history
- [ ] **My Profile**: update name/phone; set/change 4-digit PIN
- [ ] **Appearance**: Light / Dark / System switches instantly and persists; no flash on reload

## 13. Billing (Paystack) — when `PAYSTACK_SECRET_KEY` set
- [ ] Owner clicks **Pay / Renew** → redirected to Paystack checkout
- [ ] Successful payment → webhook flips subscription to **active**, extends paid-until, logs payment
- [ ] Webhook with a bad/missing signature → 401
- [ ] Same payment reference twice → not double-counted (idempotent)
- [ ] If Paystack not configured, owner sees the "contact PharmaTrack" message (no crash)

## 14. UI / UX / responsiveness
- [ ] **Dark mode** looks correct across every screen (no white/black patches, readable badges)
- [ ] **Mobile width**: sidebar collapses to a hamburger drawer with a scrim; nav links close it
- [ ] Desktop sidebar is visible and collapsible
- [ ] POS panels stack on mobile; dialogs are full-width and usable on a phone
- [ ] Dialog overlays are glassy (blurred, see-through), centered
- [ ] Toasts appear for success/error actions

## 15. Reliability & security spot-checks
- [ ] Error tracking: if `SENTRY_DSN` set, a thrown error appears in Sentry
- [ ] No secrets in client bundles / network responses
- [ ] Cron, webhooks and platform APIs reject unauthenticated/unsigned calls
- [ ] Rate-limited endpoints behave (if Upstash configured)
- [ ] Health endpoint stays 200 under normal load

---

### Sign-off
| Area | Tester | Date | Result |
|---|---|---|---|
| Auth & roles | | | |
| POS | | | |
| Inventory & catalogue | | | |
| Appointments | | | |
| Platform & billing | | | |
| UI / responsive | | | |
