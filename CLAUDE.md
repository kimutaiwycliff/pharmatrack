# PharmaTrack — Master Claude Code Reference

> Single source of truth for Claude Code. Drop this file in the repo root.
> Author: Wycliff Kimutai · June 2026
> Stack freeze date: June 2026 — open an ADR before changing any pinned choice.

---

## 1. What You Are Building

A **multi-tenant, offline-capable pharmacy SaaS for Kenya**. Self-hosted on a single VM via
Docker Compose, managed through `make` commands. Every pharmacy that signs up gets a fully
isolated tenant enforced by Postgres Row-Level Security. The platform operator provisions,
bills, and monitors all tenants from a separate console.

**Competitive position vs PharmaSync / PharmaPOS / Zendawa:**
- Full self-hosted Docker Compose (no cloud lock-in)
- Indefinite offline POS via Dexie/IndexedDB (not time-limited like PharmaSync's 24 h)
- Postgres RLS multi-tenancy (run hundreds of tenants on one VM)
- White-label ready via CSS variable tokens
- Revenue-sharing reseller model via operator console
- KRA eTIMS compliance and SHA/NHIF digital claims available as optional Phase 8 add-ons

---

## 2. Non-Negotiable Constraints

These are invariants. Every PR must respect them. If you cannot respect one, open an ADR.

1. **Postgres RLS via `SET LOCAL` GUCs — deny by default.**
   The two-org isolation test (`make test-rls`) must be green before any feature is merged.
2. **Better Auth with org plugin — orgs ARE tenants.** No bespoke auth crypto.
3. **Offline POS must work indefinitely without a connection.** Dexie/IndexedDB caches the
   full branch catalogue. Sales queue with idempotent keys and flush on reconnect.
4. **Money is stored as `numeric(12,2)` in the database; computed as integer cents in
   `packages/core`.** Never use floating-point arithmetic for money.
5. **All date math and groupings use the `Africa/Nairobi` timezone.** Use `date-fns-tz` or
   Postgres `AT TIME ZONE 'Africa/Nairobi'` — never assume UTC for display.
6. **Stack is fixed (see §3).** Document every deviation as a numbered ADR in `docs/adr/`.
7. **Every API route validates input with a Zod schema.** No unchecked `req.body` access.
8. **RLS isolation suite is re-run at the start of Phase 1, at the end of Phase 5, and
   before production launch.** Not optional.
9. **eTIMS and SHA/NHIF are optional (Phase 8).** Do not wire eTIMS hooks into the sales
   path or SHA fields into the schema until Phase 8 is explicitly started.

---

## 3. Stack (Fixed)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 22 LTS, TypeScript strict | |
| Package manager | pnpm workspaces + Turborepo | |
| Web framework | Next.js 15 App Router | SSR + API routes + server actions |
| Database | PostgreSQL 16 | RLS enforced; two roles |
| ORM | Drizzle ORM | SQL-first; composable queries |
| Migrations | dbmate (raw SQL) | Allows hand-written RLS policies & functions |
| Auth | Better Auth (org + admin plugins, Drizzle adapter) | |
| Queue | BullMQ + Redis (ioredis) | Background jobs, cron, retries |
| Object storage | MinIO (S3-compatible, self-hosted) | Product images + DB backups |
| Email | **Resend** (launch) → Postal (Phase 7 optional) | Do NOT use Postal at launch |
| SMS | Africa's Talking | KES 0.4/SMS to Safaricom |
| WhatsApp | Africa's Talking WhatsApp Business API | Easier than Meta Cloud API at launch |
| Mobile payments | M-Pesa Daraja STK Push + callback | |
| SaaS billing | Paystack (checkout + webhook) | |
| Proxy | Caddy 2 | Auto Let's Encrypt TLS |
| UI primitives | shadcn/ui (Radix UI) | |
| Styling | Tailwind CSS v4 | CSS variable tokens prefixed `--pt-` |
| Tables | TanStack Table v8 | |
| Forms | React Hook Form + Zod | |
| State | Zustand | POS cart, offline sync state |
| PWA / SW | Serwist | Production only; network-first nav |
| Offline DB | Dexie (IndexedDB) | Branch catalogue cache + sale queue |
| Receipts | @react-pdf/renderer | A4 + thermal 80 mm |
| Barcode | USB keyboard-wedge + zxing (camera) + gs1js | GS1 GTIN/batch/expiry parsing |
| Charting | Recharts | Reports + dashboard |
| Observability | GlitchTip (errors) + pino (logs) | Loki/Grafana stack added Phase 7 |
| Testing | Vitest + Playwright + RLS isolation suite | |
| Secrets | Doppler (recommended) or SOPS + age | Never commit plaintext secrets |
| CI/CD | GitHub Actions (launch) | Gitea + Woodpecker migration at scale |

**Do NOT introduce:** Kannel/GSM modem, WebSocket subscriptions, Kubernetes, Prisma,
MongoDB, hand-built UI primitives, native mobile app, AI/ML forecasting (v1 scope).

---

## 4. Monorepo Layout

```
pharmatrack/
├─ apps/
│  ├─ web/                     # Next.js 15 — UI + API routes + server actions
│  └─ worker/                  # BullMQ workers + cron scheduler
├─ packages/
│  ├─ ui/                      # shadcn design system (primitives → composites → features)
│  ├─ db/                      # Drizzle schema, dbmate migrations, seed, RLS helpers
│  ├─ auth/                    # Better Auth config, session helpers, requireRole()
│  ├─ core/                    # Domain logic: pricing, FEFO, money, DUR, receipts
│  ├─ jobs/                    # BullMQ queue definitions + job type registry
│  └─ integrations/
│     ├─ mpesa/                # Daraja STK push + callback client
│     ├─ paystack/             # Checkout + webhook verification
│     ├─ resend/               # Email (React Email templates)
│     ├─ africastalking/       # SMS + WhatsApp Business API
│     └─ minio/                # S3-compatible image + backup client
│  # Phase 8 only (do not create until Phase 8 begins):
│  # integrations/etims/       KRA eTIMS VSCU client
│  # integrations/sha/         SHA/NHIF claims client
├─ packages/types/             # Shared TypeScript types + Zod schemas
├─ infra/
│  ├─ compose.core.yml         # App stack: postgres, redis, minio, caddy, app, worker
│  ├─ compose.ops.yml          # Ops: Grafana, Loki, Promtail, Prometheus, exporters
│  ├─ compose.ci.yml           # Throwaway DB + redis for CI
│  ├─ Caddyfile
│  ├─ migrations/              # dbmate SQL migration files (001_*.sql …)
│  └─ backups/                 # pg_dump outputs (gitignored)
├─ Makefile
├─ docs/adr/                   # ADR-001 … ADR-011 (write before touching code)
└─ CLAUDE.md                   # ← this file
```

### shadcn layering rule
`primitives` (Button, Input, Dialog…) → `composites` (DataTable, FormField, KpiCard,
PageHeader, StatusBadge, Money, EmptyState) → `features` (CartPanel, ReceiptModal,
StockBadge…) → `routes` (app/pos/page.tsx…). Never import a feature from a primitive.

---

## 5. Database Design Principles

### Two DB roles (RLS)
```sql
-- app_owner: migrations, seed, platform admin queries (bypasses RLS)
-- app_authenticated: all application queries (subject to RLS)
CREATE ROLE app_owner   LOGIN PASSWORD '...';
CREATE ROLE app_authenticated LOGIN PASSWORD '...';
```

### withTenant() pattern
Every server action / API route that touches tenant data must call `withTenant()`:
```typescript
// packages/db/src/tenant.ts
export async function withTenant<T>(
  organizationId: string,
  fn: (db: DrizzleDB) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.organization_id = ${organizationId}`);
    await tx.execute(sql`SET LOCAL ROLE app_authenticated`);
    return fn(tx);
  });
}
```

### Money rule
```typescript
// packages/core/src/money.ts
// All arithmetic in integer cents; round only at the boundary
export const toCents = (amount: Decimal) => Math.round(amount.toNumber() * 100);
export const fromCents = (cents: number) => new Decimal(cents).div(100);
```

### Key tables (abbreviated — full schema in migrations)
```sql
organization          -- Better Auth org; one per tenant
branch                -- Multi-branch per org
user / session        -- Better Auth managed
staff_profile         -- pin_hash, role, branch_id (extends user)
platform_admin        -- Operator-only users
plan / subscription / subscription_payment

-- Catalogue
product               -- generic_name, brand_name, gtin, strength, dosage_form,
                      --   controlled boolean, requires_prescription boolean,
                      --   max_discount_percent numeric(5,2), reorder_level int
product_pack_size     -- unit_count, selling_price_cents, cost_price_cents
product_batch         -- batch_number, expiry_date, quantity_on_hand, cost_price_cents
category / supplier
drug_catalog          -- ~95 KEML seed products
drug_interaction      -- for DUR checks
stock_adjustment      -- reason enum, quantity_delta, audit_log_id

-- Sales
shift                 -- opening_float, closing_cash, variance
sale                  -- shift_id, total_cents, status, offline_reference
sale_item             -- product_id, batch_id, qty, unit_price_cents, discount_pct
payment               -- method (cash|mpesa|card|split), amount_cents
                      --   mpesa_checkout_request_id, mpesa_receipt_number

-- Compliance
controlled_substance_log  -- pharmacist name/reg, prescriber name/reg, patient_id,
                          --   quantity, batch_number (PPB register)
-- Phase 8 only (do not create until Phase 8 begins):
-- sha_claim, etims_retry_queue, org_settings.etims_*, org_settings.sha_facility_code

-- Appointments
customer              -- phone E.164, allergies, sha_member_number, reminder_opt_in
appointment           -- customer_id, service_id, scheduled_at, status
appointment_service   -- name, recurrence_weeks (e.g. Depo-Provera = 12)
appointment_reminder  -- appointment_id, channel (email|sms|whatsapp), status, sent_at

-- Prescriptions
prescription          -- customer_id, prescriber, created_at
prescription_item     -- drug, strength, qty, frequency

-- Org metadata
org_settings          -- (Phase 8: etims_device_serial, etims_active, sha_facility_code)

-- Audit
audit_log             -- actor_id, org_id, action, entity, entity_id, diff jsonb
```

---

## 6. Feature Inventory (Complete)

### 6.1 Authentication & Access
- Email + password login with role-based routing:
  cashier/pharmacist → `/pos`; owner/manager → `/dashboard`; platform admin → `/platform`
- Quick PIN login for the till: phone number (E.164 normalized) + 4-digit PIN (bcrypt hash)
- First-run `/setup` screen — self-locks after first platform admin is created
- Staff & tenant invitations by email (magic link → set password via Resend)
- Password reset / recovery via email link
- Change password and set/update PIN from profile settings
- Session management with sign-out; route protection via Next.js middleware
- Subscription gate: block tenant app when subscription is not `trialing` or `active`
- RBAC: `owner` > `manager` > `pharmacist` > `cashier`

### 6.2 Point of Sale (POS)
- Product search by name, brand, or barcode/GTIN (full-text + Postgres GIN index)
- Barcode scanning via USB keyboard-wedge and camera (zxing), with GS1 parsing
  (GTIN, batch number, expiry date from GS1-128 / GS1 DataMatrix)
- Quick-add product grid + recently-scanned chips
- Cart (Zustand `CartStore`): qty edit, per-line discounts capped by `max_discount_percent`
- Live totals: subtotal, total discount, tax (if applicable), grand total
- Payment methods:
  - **Cash**: tendered amount → change calculated
  - **M-Pesa STK Push**: `MpesaModal` → `POST /api/mpesa/initiate` → poll
    `/api/mpesa/status`; worker confirms via `/api/mpesa/callback`
  - **Card**: mark as card; manual confirmation (no external API at launch)
  - **Split**: partial cash + partial M-Pesa
  - *(Phase 8) SHA Insurance*: capture `sha_member_number`, amount, queue SHA claim
- `POST /api/sales`: persist `sale` + `sale_items`, FEFO batch decrement
- Receipts: on-screen `ReceiptModal` + `@react-pdf/renderer` PDF (A4 + thermal 80 mm)
  Receipt must include: tenant name/logo, items, totals, payment method
  *(Phase 8: KRA QR code + CUIN added once eTIMS module is enabled)*
- FEFO (first-expiry-first-out): consume earliest-expiry batch first on every sale
- Responsive POS: full-screen product search + bottom-sheet cart on mobile/tablet

### 6.3 Shifts (Till Sessions)
- Clock in with opening cash float (required before any sale)
- Clock out with closing cash → automatic variance calculation
- `ShiftSummarySheet`: sales totals by payment method, variance
- `/shifts` history with filterable list

### 6.4 Inventory & Stock
- Inventory list: stock-on-hand per branch, status badges
  (out of stock / low stock / expiring ≤90 days / controlled), search, filters, pagination
- Mobile card view with per-item actions
- Receive stock: add batches (batch number, expiry, qty, cost price, supplier)
  Create new product inline from scan or drug catalog match
- Batch management: all batches per product per branch — qty, expiry, cost, FEFO order
- Stock adjustments with reasons: count correction / damage / expiry write-off /
  theft-loss / customer return / other; `audit_log` entry on every adjustment
- Expiry tracking: earliest in-stock batch surfaced; expiring-soon highlighting
- Low-stock / reorder level tracking
- Controlled substances register (PPB compliance) — see §6.14
- CSV bulk import (≤2 000 rows): template download, client-side parse, column auto-map
  with manual override, validation preview, per-row results; creates products + batches
- One-click catalog seed/unseed: load KEML drug catalog into branch (inactive + unpriced
  until reviewed); unseed removes only untouched seeded products

### 6.5 Catalogue
- Products CRUD: generic + brand name, GTIN, strength, dosage form, base unit,
  pack sizes, cost & selling price (per pack size), reorder level, max_discount_percent,
  controlled flag, requires_prescription flag, product images (MinIO)
- Categories: two-level (category + subcategory) management
- Suppliers: list + default supplier per product
- Shared drug catalog: ~95 common Kenyan products seeded from MoH KEML 2023 + PPB
  (name, strength, dosage form, category, controlled/Rx flags, narc_class)
- Drug interactions reference data (used by DUR in prescriptions)

### 6.6 Appointments & Reminders
- Customers: phone (E.164), allergies, reminder opt-in per channel
  *(Phase 8: sha_member_number field added to customer)*
- Book appointments: service + date; recurring services suggest next dose automatically
  (e.g. Depo-Provera at `recurrence_weeks = 12`)
- Tenant-managed service list at `/settings/services` with recurrence intervals
- Appointment reminders the day before via: email (Resend) / SMS (AT) / WhatsApp (AT)
  Per-customer opt-in; `appointment_reminder` ledger tracks status
- Cron job guarded by `CRON_SECRET` header: `/api/cron/appointment-reminders`

### 6.7 Prescriptions
- Create prescriptions with line items linked to a customer
- Drug Utilization Review (DUR): cross-reference prescription items against
  `drug_interaction` table; flag severity (contraindicated / major / moderate)
- Prescription linked to sale row for full audit trail

### 6.8 Reports & Analytics
- Date-range + branch filters; all aggregations in `Africa/Nairobi` timezone
- **Sales report**: revenue, cash/M-Pesa/card split, gross profit + margin
  (batch cost → fallback to product cost), daily revenue chart, by-cashier breakdown,
  top products with profit/margin, latest 100 transactions
- **Inventory report**: SKU counts by status, full item table
- **Financial report**: revenue, discounts, avg order value, gross profit,
  monthly trend chart + breakdown table
- **PPB Controlled Substances register export** (PDF/CSV — PPB-compliant format)
- CSV export on every report table
- *(Phase 8) eTIMS report*: submission rate, failed invoices, CUIN list (CSV for KRA audit)
- *(Phase 8) SHA Claims report*: claims by status, settled amounts, reconciliation tab

### 6.9 Dashboard (Owner / Manager)
- Today's KPIs: revenue, transaction count, payment method split
- Low-stock count, expiring-within-90d count
- Recent activity, Recharts charts
- *(Phase 8) eTIMS failed-invoice count added to KPIs*

### 6.10 Staff Management
- Staff list: role, branch, status, join date
- Invite staff by email
- Change role (manager / pharmacist / cashier)
- Activate / deactivate staff
- Set a login PIN for a staff member (owner/manager only)
- `requireRole()` server helper enforces RBAC on every protected route

### 6.11 Settings
- **Organization** (owner only): name, registration, contact, address
- **Branches**: create + manage multiple branches
- **Services**: manage appointment service catalogue
- **Billing**: view plan, trial countdown, payment history; Paystack checkout
- **My Profile**: name, phone, change password, set/update PIN
- **Appearance**: light / dark / system theme

### 6.12 Platform / Operator Console
- Tenant directory: all pharmacies with branch/staff counts + subscription status
- Provision tenant (one step): org + default branch + 14-day trial subscription +
  default appointment services + owner invite email
- Tenant detail: manage subscription (status, trial end, plan), record manual payments,
  suspend / reactivate tenant
- Operator-only access; completely separate RBAC from pharmacy staff
- *(Phase 8) eTIMS tab per tenant: VSCU registration + submission stats*

### 6.13 Billing & Subscriptions
- Plan catalogue: starter / growth / enterprise; monthly + annual pricing in KES
- One `subscription` per org: `trialing` / `active` / `past_due` / `suspended` / `cancelled`
- `SubscriptionGate` middleware blocks tenant app on non-active states
- 14-day trial on provision (`trial_ends_at`)
- Dunning: `past_due` → `suspended` after 7 days (BullMQ delayed job)
- Online billing: Paystack checkout session + webhook (`/api/webhooks/paystack`)
- Manual payment ledger (operator records offline payments)

### 6.14 PPB Controlled Substances Register

- `controlled_substance_log`: dispensing pharmacist name + reg number,
  prescriber name + reg number, patient ID, quantity dispensed, batch number
- Enforced on every `sale_item` where `product.controlled = true`
- `/reports/controlled-substances`: PPB-compliant PDF/CSV export

### 6.15 *(Phase 8 — Optional)* KRA eTIMS Integration

> Build this only when explicitly instructed to start Phase 8. Do not wire any eTIMS
> logic into the core sales path before then.

- `packages/integrations/etims/etims-client.ts`: KRA VSCU/OSCU API client
  (sandbox when `ETIMS_SANDBOX=true`)
- `org_settings` additions: `etims_device_serial`, `etims_active`
- `sale` additions: `etims_invoice_number`, `etims_qr_code`, `etims_status`
- Tenant setup: `POST /api/platform/[orgId]/etims/register`
- BullMQ job: `etims-invoice.processor.ts` — format payload → POST KRA API →
  store CUIN + QR on sale row; retry with exponential backoff (max 5); GlitchTip alert
- Receipt PDF patched with KRA QR once CUIN stored
- `/reports/etims`: compliance report (submitted / failed / pending)
- `/platform/[orgId]/etims`: operator eTIMS stats per tenant

### 6.16 *(Phase 8 — Optional)* SHA / NHIF Claims

> Build this only when explicitly instructed to start Phase 8.

- `sha_claim` table linked to `sale` + `prescription`
- `sha_member_number` field on `customer`
- SHA Insurance POS payment type
- BullMQ jobs: `sha-claim-submit.processor.ts` + `sha-claim-poll.processor.ts` (daily cron)
- `/reports/sha-claims`: status, settled amounts, CSV export

### 6.17 Offline & PWA

- Installable PWA (Serwist service worker, production only)
- App-shell caching: `/pos` loads without a connection after one online visit
- **Offline POS (Dexie/IndexedDB)**:
  - Pre-cache full branch catalogue on POS load (products + pack sizes + batches)
  - Offline product search + barcode lookup from Dexie
  - Queue sales with `offline_reference` UUID (idempotent key)
  - Background sync: flush queued sales via `POST /api/sales`; server dedupes on `offline_reference`
  - Poison records (malformed / `409 Conflict`) written to Dexie dead-letter store
- Online indicator in POS header; sync status badge

### 6.18 Integrations Summary

| Integration | Purpose |
|---|---|
| M-Pesa Daraja | STK Push + confirmation callback |
| Paystack | Card payments + SaaS subscription billing |
| Resend | Transactional email (invites, resets, reminders) |
| Africa's Talking SMS | Appointment reminders |
| Africa's Talking WhatsApp | Appointment reminders (Business API) |
| MinIO | Product images + DB backup target |
| *(Phase 8)* KRA eTIMS | Fiscal invoice submission |
| *(Phase 8)* SHA/NHIF | Insurance claims |

### 6.19 Cross-Cutting Concerns

- Multi-tenant Postgres RLS isolation; multi-branch with branch selector
- Role-based navigation and permissions throughout
- Dark / light / system theme (Tailwind + CSS variables)
- Toast notifications for all user-facing feedback
- Audit logging: every sensitive action writes an `audit_log` row
  (stock adjustments, controlled substance dispensing, role changes, subscription changes)
- Kenyan localization: KES formatting, Africa/Nairobi timezone, E.164 phone normalization
  Kenyan phone patterns accepted: `07…` / `2547…` / `+2547…` / bare `7…`
- `/api/health` endpoint: returns `{db, redis, storage, email}` status

---

## 7. Build Phases

**Rule: do not begin a phase until its Definition of Done (DoD) is fully green.**
Never break the CI gate. Every commit must pass `make typecheck && make lint && make test-rls`.

---

### Phase 0 — Foundations (Week 1)

**Goal:** working infrastructure skeleton; RLS isolation proven before any feature exists.

Tasks:
- Scaffold monorepo: `pnpm workspaces + Turborepo`, all package stubs with correct `package.json`
- `packages/ui`: shadcn init, `--pt-*` CSS variable tokens, light/dark theme
  Composites: `DataTable`, `FormField`, `KpiCard`, `PageHeader`, `StatusBadge`, `Money`, `EmptyState`
  Storybook configured, all composites listed
- `packages/db`: Drizzle schema stubs, dbmate setup, **two DB roles** (`app_authenticated`,
  `app_owner`), `withTenant()` helper, `dbAdmin` pool for migrations
- ENV parsing: `@t3-oss/env-nextjs` + Zod validation for all environment variables
- `infra/compose.core.yml`: postgres, redis, minio, caddy, app (stub 200), worker (stub)
- `Makefile` with all targets listed in §9
- GlitchTip container + `@sentry/nextjs` wired up
- pino logger; `/api/health` returns `{db, redis, storage, email}` JSON
- GitHub Actions CI: install → typecheck → lint → vitest → `dbmate up` on throwaway DB → build
- **RLS isolation test** (`packages/db/tests/rls-isolation.test.ts`): two orgs, every table —
  must pass before Phase 1 starts

**DoD:** `make up` boots clean. `/api/health` returns 200. Two-org RLS isolation test passes.
CI green on a fresh database. Storybook lists all composites.

---

### Phase 1 — Tenancy, Auth & Staff (Weeks 2–3)

Tasks:
- Better Auth: email/password, org plugin (orgs = tenants), admin plugin, Drizzle adapter
- Full DB schema: `user`, `session`, `account`, `verification`, `organization`, `member`,
  `invitation`, `staff_profile`, `platform_admin`, `branch`
- `plan`, `subscription`, `subscription_payment` tables (gate stub; full logic Phase 6)
- `org_settings` table (`sha_facility_code`, `etims_device_serial`, `etims_active`)
- `proxy.ts` middleware: auth guard, `/setup` redirect when uninitialized, role-based routing
- `/setup`: first-run operator creation (self-locks after first `platform_admin`)
- `/platform`: operator console — list tenants, provision tenant (org + branch + trial sub +
  owner invite), stub billing actions for Phase 6
- `/login`: email + password; role-based redirect
- PIN login: `POST /api/auth/pin` — phone (E.164 normalized) + 4-digit PIN (bcrypt `pin_hash`)
- `/staff`: list, invite, change role, activate/deactivate, set PIN (owner/manager only)
- Staff invite email + password reset via Resend (React Email template)
- `requireRole()` server helper; RBAC enforced
- `/settings/profile`: name, phone, change password, set/update PIN
- Playwright e2e: setup flow, login, invite-accept, PIN login, password reset, role routing

**DoD:** Two orgs provisioned. RLS isolation suite re-run and passes. Full auth e2e green.
Role-based routing correct. `/api/health` includes auth status.

---

### Phase 2 — Catalogue & Inventory (Weeks 3–5)

Tasks:
- DB schema: `product`, `product_pack_size`, `category`, `supplier`, `drug_catalog`,
  `drug_interaction`, `product_batch`, `stock_adjustment`, `controlled_substance_log`
- `product_stock` VIEW: on-hand total, earliest_expiry, batch_count
- Seed: Kenya Essential Medicines List (~95 SKUs) into `drug_catalog`
  Source: MoH KEML 2023 + PPB registered list
  Fields: name, generic_name, strength, dosage_form, category, controlled flag, narc_class
- `/products` CRUD: brand/generic, GTIN, strength, pack sizes, cost/price, reorder level,
  `max_discount_percent`, controlled/Rx flags, image upload → MinIO
- `/categories`: two-level `CategoryManager`
- `/suppliers` CRUD
- `/inventory` list: stock-on-hand, status badges, FEFO logic display, mobile card view
- Receive stock: scan/search → batches (batch no, expiry, qty, cost, supplier);
  new product inline creation from scan or catalog match
- Stock adjustments with reasons → `stock_adjustment` + `audit_log` entries
- CSV bulk import (≤2 000 rows): template download, client parse, column auto-map,
  preview, per-row results; creates products + opening batches
- Catalog seed/unseed: load `drug_catalog` → branch products (inactive + unpriced)
- Controlled substances register view (PPB-compliant)

**DoD:** Receive → adjust → view flows green. FEFO order correct. CSV import verified.
Catalog seed/unseed works. RLS holds for all new tables. Mobile inventory cards usable on phone.

---

### Phase 3 — POS, Payments & Offline (Weeks 5–7)

Tasks:
- DB schema: `shift`, `sale`, `sale_item`, `payment`
  `sale` columns include: `offline_reference` (UUID for idempotent sync — no eTIMS columns yet)
  `payment.method` enum: `cash | mpesa | card | split`
- Shifts: clock-in (opening float), clock-out (closing cash, variance), `ShiftSummarySheet`,
  `/shifts` history
- Product search/scan: name/brand/GTIN full-text, barcode via USB wedge + GS1 parse + zxing camera,
  recently-scanned chips, quick-add grid
- Cart (CartPanel, Zustand): qty edit, per-line discount (capped by `max_discount_percent`),
  live totals (subtotal, discount, tax, total)
- Payment flows (four types: cash, M-Pesa STK, card, split)
- `POST /api/sales`: persist sale + items, FEFO batch decrement
- Receipt: `ReceiptModal` (on-screen) + `@react-pdf/renderer` PDF (A4 + thermal 80 mm)
  Includes: tenant name/logo, items, totals, payment method, receipt number
- PWA: Serwist SW (production only), network-first navigations, cache-first static assets,
  offline fallback to cached `/pos` shell
- Offline (Dexie):
  - Pre-cache full branch catalogue on POS load
  - Offline search + barcode lookup from Dexie
  - Queue sales with `offline_reference` UUID
  - Background sync: `POST /api/sales` with `offline_reference`; server dedupes on it
  - Poison records → Dexie dead-letter store
- Responsive POS: full-screen search + bottom-sheet cart on mobile/tablet
- Online indicator + sync status badge in POS header

**DoD:** End-to-end sale for all four payment types. Offline sale → reconnect → sync verified.
FEFO decrements correct. Receipt renders PDF + thermal. Mobile POS usable on phone. RLS holds.

---

### Phase 4 — Appointments & Prescriptions (Weeks 7–8)

#### 4A — Appointments & Reminders

- DB schema: `customer`, `appointment`, `appointment_service`, `appointment_reminder`
- `/appointments`: customer list, book appointment, recurring next-dose suggestion
- `/api/customers` CRUD (E.164 phone, allergies, reminder opt-in)
- Reminder cron (`/api/cron/appointment-reminders`, `CRON_SECRET`):
  Day-before reminders via email (Resend React Email) / SMS (AT) / WhatsApp (AT)
- `/settings/services`: tenant appointment service management

#### 4B — Prescriptions

- `prescription`, `prescription_item` tables
- `/prescriptions`: create + manage prescriptions linked to customer
- DUR check in `packages/core/lib/prescriptions/dur.ts`
- Prescription linked to `sale` for audit trail

**DoD:** Day-before reminder sends on all three channels (Resend + AT SMS + AT WhatsApp verified).
DUR flags a known drug interaction. RLS holds for all new tables.

---

### Phase 5 — Reporting & Dashboard (Weeks 8–9)

Tasks:
- `/dashboard`: today's KPIs, low-stock count, expiring-soon count,
  recent sales, Recharts charts — all in Africa/Nairobi timezone
- `/reports` (owner/manager only, date range + branch filter):
  - Sales, Inventory, Financial, PPB Controlled Substances (all per §6.8)
  - CSV export on every report table

**DoD:** Numbers reconcile against seeded sales. Profit uses batch cost with product fallback.
CSV exports valid. Africa/Nairobi timezone grouping verified.

---

### Phase 6 — SaaS Billing (Week 9–10)

Tasks:
- Plan catalogue (starter/growth/enterprise, KES monthly + annual)
- `SubscriptionGate` middleware: block app unless `trialing` or `active`
- Billing settings panel: current plan, trial countdown, payment history
- `POST /api/billing/checkout`: Paystack checkout session
- `POST /api/webhooks/paystack`: update subscription + `subscription_payment` ledger
- Dunning: `past_due` → `suspended` after 7 days (BullMQ delayed job)
- Trial: 14-day `trial_ends_at` on provision
- Operator: suspend/reactivate, record manual payment, plan override

**DoD:** Trial → active → past_due → suspended transitions gate access correctly.
Paystack webhook updates ledger. Operator can suspend/reactivate. Subscription gate blocks correctly.

---

### Phase 7 — Ops, Security & Launch (Weeks 10–11)

Tasks:
- `compose.ops.yml`: Grafana + Loki + Promtail + Prometheus + postgres-exporter +
  node-exporter + cAdvisor + Uptime Kuma (run on separate VM-B)
- pino → Promtail → Loki → Grafana dashboards
  Structured log fields: `{reqId, orgId, userId, route, ms, statusCode}`
- Prometheus alerts: queue depth, DB connections, node memory
- pgBackRest → MinIO (PITR): WAL archiving + scheduled base backups;
  **run a successful restore drill before launch (mandatory)**
- Nightly `pg_dump` → MinIO (secondary backup) + failure alert
- Security review checklist:
  - RLS isolation suite full re-run (all tables)
  - HTTP headers: CSP, HSTS, X-Frame-Options (Caddy)
  - Rate limiting: `/api/auth`, `/api/mpesa`, `/api/webhooks` (Redis + ioredis)
  - All API routes validated with Zod
  - PPB controlled substances compliance review
  - Secrets rotation runbook (Doppler / SOPS)
- k6 load test: `/api/sales` + `/api/products/search` at 50 concurrent users, P95 < 500 ms
- `DEPLOYMENT.md`: VM sizing, DNS, Caddy config, `make deploy` runbook, rollback procedure
- `USER_GUIDE.md`: pharmacy owner onboarding walkthrough

**DoD:** Restore drill succeeds. All dashboards and alerts live. Security review clean.
Load test meets P95 < 500 ms at 50 concurrent users. RLS isolation suite full pass.

---

### Phase 8 — eTIMS & SHA Integration *(Optional — build when tenant demand requires it)*

> **Do not begin this phase without an explicit instruction to do so.**
> No eTIMS or SHA code, columns, queue jobs, or env vars belong in Phases 0–7.
> The core app ships clean and launches without these integrations.

#### 8A — KRA eTIMS

> Context: As of January 2026, KRA requires eTIMS invoices for all taxable transactions.
> Penalties for non-compliance are 2× the tax due (minimum KES 1 million). Activate this
> module per tenant when they need it.

- Add `org_settings` columns: `etims_device_serial text`, `etims_active boolean default false`
- Add `sale` columns: `etims_invoice_number text`, `etims_qr_code text`,
  `etims_status text default 'pending'`
- Add `etims_retry_queue` table
- `packages/integrations/etims/etims-client.ts`: KRA VSCU/OSCU API client;
  sandbox when `ETIMS_SANDBOX=true`
- Tenant VSCU registration: `POST /api/platform/[orgId]/etims/register`
  (stores serial in `org_settings`, sets `etims_active = true`)
- Hook `POST /api/sales`: after commit, enqueue `etims:push-invoice` job **only if
  `org.etims_active = true`** — zero impact on tenants that haven't activated eTIMS
- BullMQ job `etims-invoice.processor.ts`: format payload → POST KRA API →
  store CUIN + QR on `sale` row; exponential backoff (max 5); GlitchTip alert on exhaustion
- Receipt PDF: patch in KRA QR code once CUIN stored
- `/reports/etims`: submission rate, failed invoices, CUIN list CSV
- `/platform/[orgId]/etims`: operator VSCU registration + stats dashboard

#### 8B — SHA / NHIF Claims

- Add `sha_member_number text` to `customer`
- Add `sha_claim` table and `sha_claim_id` FK on `sale`
- Add `sha_insurance` to `payment.method` enum
- POS: SHA Insurance payment type (capture member number + amount)
- BullMQ jobs: `sha-claim-submit.processor.ts` + `sha-claim-poll.processor.ts` (daily cron)
- `/reports/sha-claims`: status, settled amounts, reconciliation CSV

**DoD (Phase 8):** eTIMS job fires on every sale for activated tenants (sandbox mock passes).
Tenants without eTIMS activated are completely unaffected. SHA claim queued and polled.
Receipt includes KRA QR. RLS holds for all new tables.

---

## 8. ADRs to Write BEFORE Any Code

Create these files in `docs/adr/` before Phase 0:

| ADR | Decision |
|---|---|
| ADR-001 | RLS via `SET LOCAL` + dual DB roles (`app_authenticated` / `app_owner`) |
| ADR-002 | Better Auth org model as tenancy source of truth |
| ADR-003 | shadcn/ui layering (primitives → composites → features → routes) |
| ADR-004 | MinIO for images + backups (S3-compatible, self-hosted) |
| ADR-005 | Email — Resend at launch; Postal migration optional in Phase 7 |
| ADR-006 | SMS via Africa's Talking; WhatsApp via AT Business API (not Kannel) |
| ADR-007 | CI/CD — GitHub Actions at launch; Gitea + Woodpecker when team grows |
| ADR-008 | Money in integer cents in core; `numeric(12,2)` in DB |
| ADR-009 | Secrets — Doppler (preferred) or SOPS + age; never committed in plaintext |
| *(Phase 8)* ADR-010 | eTIMS — async via BullMQ; sandbox mock in dev; production VSCU per tenant; opt-in per tenant |
| *(Phase 8)* ADR-011 | SHA/NHIF claims — async submission; daily poll cron for status |

---

## 9. Makefile Targets (Full Surface)

```makefile
# Core lifecycle
make up           # docker compose -f infra/compose.core.yml up -d
make down         # docker compose ... down
make restart      # down + up
make logs         # follow app + worker logs
make shell        # exec into app container

# Database
make db-migrate   # dbmate up (inside app container)
make db-rollback  # dbmate rollback
make db-seed      # pnpm --filter @pt/db seed
make db-reset     # drop + fresh migrate + seed (dev only)
make db-shell     # psql into postgres container
make db-dump      # pg_dump to ./infra/backups/

# Testing
make test         # vitest run + playwright
make test-unit    # vitest run
make test-e2e     # playwright
make test-rls     # vitest run --project rls-isolation
make typecheck    # tsc --noEmit across all packages
make lint         # eslint + biome check

# Build
make build        # turbo build
make build-image  # docker build --tag pharmatrack:latest

# Ops (VM-B)
make up-ops       # docker compose -f infra/compose.ops.yml up -d
make up-ci        # docker compose -f infra/compose.ci.yml up -d

# Secrets
make secrets-pull # doppler run -- export > .env  (or sops decrypt)
make secrets-edit # sops edit infra/secrets.enc.yaml

# Deployment
make deploy       # SSH to VM, pull image, dbmate up, compose up, health check
make rollback     # SSH, restart with previous image tag
```

---

## 10. Environment Variables (Full List)

```env
# App
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://pharmatrack.yourdomain.com
APP_PORT=3000

# Database (two connection strings for two roles)
DATABASE_URL=postgresql://app_owner:secret@postgres:5432/pharmatrack
DATABASE_AUTHENTICATED_URL=postgresql://app_authenticated:secret@postgres:5432/pharmatrack

# Auth
BETTER_AUTH_SECRET=<rotate-regularly>
BETTER_AUTH_URL=https://pharmatrack.yourdomain.com

# Redis
REDIS_URL=redis://redis:6379

# MinIO
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=<key>
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET_PRODUCTS=pharmatrack-products
MINIO_BUCKET_BACKUPS=pharmatrack-backups

# Email — Resend
RESEND_API_KEY=re_...
EMAIL_FROM=no-reply@yourdomain.com

# Africa's Talking (SMS + WhatsApp)
AFRICASTALKING_API_KEY=<key>
AFRICASTALKING_USERNAME=<sandbox|production>
AFRICASTALKING_SENDER_ID=PHARMATK
AFRICASTALKING_WHATSAPP_CHANNEL=<channel-id>

# M-Pesa Daraja
MPESA_CONSUMER_KEY=<key>
MPESA_CONSUMER_SECRET=<secret>
MPESA_SHORTCODE=<shortcode>
MPESA_PASSKEY=<passkey>
MPESA_CALLBACK_URL=https://pharmatrack.yourdomain.com/api/mpesa/callback
MPESA_ENV=sandbox   # sandbox | production

# Paystack
PAYSTACK_SECRET_KEY=sk_...
PAYSTACK_PUBLIC_KEY=pk_...
PAYSTACK_WEBHOOK_SECRET=<secret>

# KRA eTIMS — Phase 8 only; do not add until Phase 8 begins
# ETIMS_SANDBOX=true
# ETIMS_API_URL=https://etims-api.kra.go.ke
# (ETIMS_VSCU_SERIAL is stored per-tenant in org_settings, not in env)

# SHA/NHIF — Phase 8 only; do not add until Phase 8 begins
# SHA_API_URL=https://api.sha.go.ke
# SHA_API_KEY=<key>

# Cron (protects /api/cron/* endpoints)
CRON_SECRET=<random-32-chars>

# Observability
GLITCHTIP_DSN=https://...@glitchtip.internal/1
NEXT_PUBLIC_GLITCHTIP_DSN=https://...@glitchtip.internal/1
LOKI_URL=http://loki:3100   # Phase 7
```

---

## 11. VM Sizing

| Profile | RAM | vCPU | Storage |
|---|---|---|---|
| Dev / demo (core only) | 4 GB | 2 | 50 GB SSD |
| Staging / small prod (core + GlitchTip + Uptime Kuma) | 8 GB | 4 | 100 GB SSD |
| Production split: VM-A core + VM-B ops | 8 GB each | 4 each | 100 GB + 50 GB |

Recommended providers (in order):
1. **Hetzner CX32** — 4 vCPU, 8 GB, €8.29/mo (Helsinki or Nuremberg; Mumbai is closest to Nairobi)
2. **DigitalOcean 8 GB Droplet** — Bangalore or Singapore until an African region opens
3. **Safaricom Business Cloud / iCloud Africa** — lowest latency from Nairobi; check pricing

---

## 12. Scope Guardrails — Do Not Build in v1

- No realtime WebSocket subscriptions (Dexie offline sync covers POS)
- No microservices — one Next.js app + one BullMQ worker until VM is saturated
- No Kubernetes — Docker Compose on VM
- No bespoke auth crypto — Better Auth defaults
- No hand-built UI primitives — compose from shadcn only
- No Kannel / GSM modem — Africa's Talking only
- No e-commerce marketplace (Zendawa's lane)
- No AI/ML forecasting (add in v2 if traction justifies)
- ~~No native mobile app — PWA covers offline POS~~ Superseded by **ADR-013**
  (Android via React Native + WatermelonDB, for thermal-printer/Play Store needs)
- No Postal email server at launch — Resend only
- **No eTIMS or SHA code before Phase 8** — no columns, no jobs, no env vars, no imports

---

## 13. Day 1 Boot Sequence

```bash
mkdir pharmatrack && cd pharmatrack
git init
pnpm init

# Scaffold Turborepo (choose pnpm workspaces)
pnpm dlx create-turbo@latest --skip-install

# Write all 11 ADRs in docs/adr/ BEFORE any feature code

# Scaffold directories
mkdir -p apps/web apps/worker
mkdir -p packages/{ui,db,auth,core,jobs,integrations,types}
mkdir -p packages/integrations/{mpesa,paystack,resend,africastalking,minio}
# Phase 8 only: mkdir -p packages/integrations/{etims,sha}
mkdir -p infra docs/adr

# Init shadcn in packages/ui
cd packages/ui && pnpm dlx shadcn@latest init

# Write the RLS isolation test BEFORE any feature
# packages/db/tests/rls-isolation.test.ts
# Two orgs; assert each org can only see its own rows on every table

# Bring up the infrastructure stack
make up
# postgres, redis, minio, caddy boot; app returns 200 on /api/health

# First migration: two DB roles + RLS enable
# infra/migrations/001_init_rls.sql

# Run the RLS test
make test-rls   # must be GREEN before any feature work begins
```

**If `make test-rls` is green by end of Day 2, you are on track.**

---

*Total estimated build time: 9–11 weeks solo · 5–7 weeks with two developers (Phases 0–7).*
*Phase 8 (eTIMS + SHA) adds ~1–2 weeks when activated. Build it when tenants need it.*
*Competitive target: PharmaSync + PharmaPOS combined, self-hosted, compliance-ready on demand.*
