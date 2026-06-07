# PharmaTrack

**Multi-tenant pharmacy management for Kenya — point-of-sale, inventory, clinical appointments, and a SaaS billing/operator layer, in one app.**

PharmaTrack is a production-grade SaaS that pharmacies sign up for and run their day-to-day on: an offline-capable POS (cash, M‑Pesa, card, split), batch/expiry-aware inventory with a controlled-substances register, a product catalogue, suppliers, a bookings system for injections/family-planning with SMS/email reminders, reporting, staff & shift management, and a platform console for the operator to manage tenants and subscriptions.

> 📘 **New here and just want to use the platform?** Read the **[User Guide](docs/USER_GUIDE.md)** — everything a pharmacy needs to know after signing up.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started (development)](#getting-started-development)
- [Environment variables](#environment-variables)
- [Database & migrations](#database--migrations)
- [Testing & CI](#testing--ci)
- [Deployment](#deployment)
- [The SaaS / operator layer](#the-saas--operator-layer)
- [Integrations](#integrations)
- [Security](#security)
- [Roadmap](#roadmap)

---

## Features

**Point of sale**
- Fast product search + barcode/GS1 scanning, cart with per-line discounts (capped per product)
- Payments: cash (with change), **M‑Pesa STK push**, card, and split payments
- Printable / PDF receipts
- **Offline groundwork** (IndexedDB): product caching + a sale-queue/sync layer is scaffolded; full offline selling + PWA is on the [roadmap](#roadmap)
- Shift-based: clock in/out, opening float, closing cash & variance

**Inventory**
- Stock receiving with **batches, expiry tracking and cost prices**
- Low-stock and expiring-soon views; per-branch stock
- **Controlled-substances register** for narcotics compliance

**Catalogue**
- Products with brand/generic, GTIN, strength, dosage form, pack sizes, images
- Two-level categories, suppliers (with a default supplier per product), max-discount rules

**Appointments & reminders**
- Book and monitor recurring clinical visits (e.g. Depo‑Provera, vaccinations)
- Auto next-dose suggestion for recurring services
- **Email + SMS reminders** the day before, with per-customer opt-in (SMS is billable)
- Tenant-managed service list (Settings → Services)

**Management**
- Dashboards & reports (sales, inventory, financial)
- Staff management with roles + 4‑digit **PIN login** for the till
- Branches, organization settings, light/dark/system theme

**SaaS / platform**
- True multi-tenancy (every row scoped by organization via Postgres RLS)
- **Platform console** to provision pharmacies, manage subscriptions, suspend/reactivate, and record payments
- Manual billing **or** automated billing via **Paystack** (card + M‑Pesa)
- Subscription gating (suspended tenants are blocked with a clear screen)

**Roles:** `owner`, `manager`, `pharmacist`, `cashier`, plus a separate **platform admin** (SaaS operator).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19**, TypeScript |
| Styling | Tailwind CSS v4 with design tokens, light/dark via `next-themes` |
| Data/state | TanStack Query, Zustand, Zod |
| Backend | **Supabase** — Postgres + Auth (GoTrue) + Storage + Row-Level Security |
| Cache | **Upstash Redis** (product lookups, rate limiting) — swappable for self-hosted Redis |
| Offline | Dexie (IndexedDB) — product cache + sale-queue scaffolding (not yet a full offline PWA) |
| Receipts/charts | `@react-pdf/renderer`, Recharts |
| Observability | Sentry (optional, env-gated) |
| Billing | Paystack (optional, env-gated) |
| Messaging | Africa's Talking (SMS) + Resend (email) for reminders |
| Tooling | pnpm workspaces, Vitest, ESLint, GitHub Actions CI, Docker |

---

## Architecture

- **Monorepo** (pnpm workspaces): a single Next.js app plus shared `types` and a Drizzle `db` schema package.
- **Multi-tenant by design:** `organizations` is the tenant. Every table is org-scoped and enforced in the database with **RLS** helpers (`user_organization_id()`, `user_role()`), so tenant isolation doesn't depend on application code being perfect.
- **Auth:** Supabase Auth. Email/password + a PIN flow for cashiers. Invite, password-reset and email-confirmation links land on `/auth/callback` → set-password.
- **Edge/middleware:** `apps/web/proxy.ts` (Next 16's renamed middleware) guards routes and redirects unauthenticated users; public routes include auth, health, cron and webhooks.
- **Stateless app:** the web app holds no local state, so it scales horizontally (multiple replicas) behind a load balancer.
- **Backends are swappable via env:** the same code runs against Supabase Cloud + Upstash, or a fully self-hosted Supabase + Redis on your own VM.

---

## Project structure

```
pharmatrack/
├── apps/web/                  # Next.js application
│   ├── app/
│   │   ├── (auth)/            # login, /auth/callback, set-password, reset
│   │   ├── (dashboard)/       # dashboard, inventory, products, suppliers,
│   │   │                      #   appointments, staff, shifts, reports, settings
│   │   ├── (pos)/             # POS terminal
│   │   ├── (platform)/        # SaaS operator console (/platform)
│   │   └── api/               # route handlers (REST), cron, webhooks, health
│   ├── components/            # UI, feature components, theme, platform
│   ├── lib/                   # supabase clients, redis, api-auth, billing,
│   │                          #   notifications, appointments, phone, offline
│   └── proxy.ts               # auth middleware (Next 16)
├── packages/
│   ├── db/                    # Drizzle schema (reference / source of record)
│   └── types/                 # shared TypeScript types
├── supabase/
│   ├── migrations/            # SQL migrations (source of truth for the DB)
│   └── seed/                  # dev seed script
├── docs/USER_GUIDE.md         # how to use the platform after signing up
├── Dockerfile, docker-compose.yml
└── .github/workflows/ci.yml
```

---

## Getting started (development)

### Prerequisites
- **Node 22+** and **pnpm 9+**
- A **Supabase** project (cloud is fine for dev)
- Optional: Upstash Redis, and provider keys for the integrations below

### 1. Install
```bash
pnpm install
```

### 2. Configure environment
Copy the example and fill in your values (see [Environment variables](#environment-variables)):
```bash
cp .env.local.example apps/web/.env.local
```

### 3. Set up the database
Apply the SQL migrations in `supabase/migrations/` to your Supabase project (in order) — via the Supabase SQL editor, the Supabase CLI, or the Supabase MCP. Then optionally seed dev data:
```bash
pnpm seed
```

### 4. Run the app
```bash
pnpm dev      # http://localhost:3000
```

> **Note:** the dev server runs with Webpack and a bounded heap (`next dev --webpack` + `--max-old-space-size`). This is intentional — Next 16's default Turbopack dev watcher can exhaust memory on low-RAM machines. Production builds (`pnpm build`) are unaffected.

---

## Environment variables

Defined in `.env.local.example`. Group at a glance:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase project (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-side admin ops (invites, cron, platform) |
| `DATABASE_URL` | ✅ | Postgres connection (migrations/seed) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Canonical app URL (links, callbacks) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | ➖ | Cache/rate-limit (falls back to DB if unset) |
| `MPESA_*` | ➖ | M‑Pesa Daraja STK push at the till |
| `AT_USERNAME` / `AT_API_KEY` / `AT_SENDER_ID` | ➖ | Africa's Talking SMS reminders |
| `RESEND_API_KEY` / `RESEND_FROM` | ➖ | Email reminders |
| `CRON_SECRET` | ➖ | Protects the reminder cron endpoint |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | ➖ | Error tracking |
| `PAYSTACK_SECRET_KEY` / `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | ➖ | Automated subscription billing |

Every optional integration **degrades gracefully** — the app runs fully without them; the related feature simply stays inactive until configured.

---

## Database & migrations

- The **source of truth** is `supabase/migrations/*.sql`, applied in numeric order.
- `apps/web/lib/supabase/database.types.ts` holds the generated TypeScript types (regenerate after schema changes).
- `packages/db` mirrors the schema in Drizzle for reference; runtime queries use the Supabase client.
- RLS is enabled on all tenant tables; platform-only writes go through service-role API routes guarded by `is_platform_admin()`.

---

## Testing & CI

```bash
pnpm --filter web typecheck   # tsc --noEmit
pnpm --filter web lint        # eslint
pnpm --filter web test        # vitest
pnpm --filter web build       # production build
```

**GitHub Actions** (`.github/workflows/ci.yml`) runs typecheck → lint → test → build on every push and PR.

For manual release testing, use the **[QA checklist](docs/QA_CHECKLIST.md)**.

---

## Deployment

The app is a stateless Next.js server; the only choice is where Postgres/Auth/Storage/Redis live.

### Option A — Managed (fastest)
Deploy the app to **Vercel** (or Render/Fly), with **Supabase Cloud** + **Upstash** + Resend + Africa's Talking. `vercel.json` schedules the reminder cron (once daily on the free tier).

### Option B — Self-hosted (VM / Docker Swarm)
The repo ships a **multi-stage `Dockerfile`** (standalone output, non-root, healthcheck) and a **`docker-compose.yml`** (web + Redis + a cron driver that hits the reminder endpoint every 15 min).

```bash
cp .env.local.example .env   # fill values
docker compose up -d --build
```

For a **pure-VM** stack, run [self-hosted Supabase](https://supabase.com/docs/guides/self-hosting/docker) alongside and point `NEXT_PUBLIC_SUPABASE_URL` at it — **the application code is identical**. For Swarm, deploy the same image as a replicated service behind Traefik/Caddy (TLS), pin Postgres to a node with a durable volume, and use Docker secrets for keys.

- **Health check:** `GET /api/health` for load balancers, Swarm, and uptime monitors.
- **Reminders:** Vercel Cron (managed) or the compose `reminder-cron` service / any external cron hitting `/api/cron/appointment-reminders` with the `CRON_SECRET` bearer token.

> Either way, configure **SMTP + redirect URLs in Supabase Auth** so invite/reset emails deliver and land on `/auth/callback`.

---

## The SaaS / operator layer

PharmaTrack is built to be **operated as a service**:

- **Tenants** = `organizations`. Each has a `subscription` (status: trialing/active/past_due/suspended/cancelled) on a `plan`.
- The **platform console** at `/platform` (platform admins only) lists tenants, provisions new pharmacies (creates the org + owner invite + branch + services + subscription), changes plans/status, extends paid-until/trial, suspends/reactivates, and records payments.
- **Access gating:** if a tenant's subscription isn't active/trialing, its staff see an "Access paused" screen.
- **Billing:** manual (operator records payments) **or** automated via Paystack (`/api/webhooks/paystack` activates and extends the subscription on `charge.success`).

Grant operator access by adding a user's `auth.users` id to the `platform_admins` table.

---

## Integrations

| Integration | Enables | How to turn on |
|---|---|---|
| **Supabase** | DB, auth, storage, RLS | Core — set the `*SUPABASE*` vars |
| **M‑Pesa (Daraja)** | STK push payments at the till | Set `MPESA_*` |
| **Africa's Talking** | SMS appointment reminders | Set `AT_*` |
| **Resend** | Email reminders | Set `RESEND_*` |
| **Paystack** | Card + M‑Pesa subscription billing | Set `PAYSTACK_SECRET_KEY`; add the webhook `{APP_URL}/api/webhooks/paystack` |
| **Sentry** | Error tracking | Set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` |
| **Upstash Redis** | Faster lookups, rate limiting | Set `UPSTASH_*` (else DB fallback) |

---

## Security

- **Tenant isolation** enforced in Postgres via RLS — not just in app code.
- **Role-based access** (owner/manager/pharmacist/cashier) on every write API.
- **Controlled-substances register** for regulatory traceability.
- **Webhooks** are signature-verified (Paystack HMAC) and idempotent.
- **Cron** endpoint requires a bearer secret; **platform** APIs require platform-admin + service role.
- Secrets via environment / Docker secrets; never commit `.env.local`.

---

## Roadmap

Designed-for, not yet built:
- **Full offline POS + PWA** — finish wiring the existing sale-queue/sync layer (`lib/offline/db.ts`), add a service worker + manifest, and offline product search
- Public self-serve signup (today pharmacies are provisioned by the operator)
- Per-plan limits & feature gating (schema already supports `plans.limits` / `features`)
- End-to-end (Playwright) test suite
- Deeper analytics & data export

---

*Built for Kenyan pharmacies. For day-to-day usage, see the **[User Guide](docs/USER_GUIDE.md)**.*
