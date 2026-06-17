# PharmaTrack

**Multi-tenant pharmacy management for Kenya — point-of-sale, inventory, clinical appointments, and a SaaS billing/operator layer, in one app.**

PharmaTrack is a production-grade SaaS that pharmacies sign up for and run their day-to-day on: an offline-capable POS (cash, M‑Pesa, card, split), batch/expiry-aware inventory with a controlled-substances register, a product catalogue, suppliers, a bookings system for injections/family-planning with SMS/email reminders, reporting, staff & shift management, and a platform console for the operator to manage tenants and subscriptions.

It is **fully self-hosted** — Postgres, Redis, object storage and the app all run on your own VM via Docker Compose, managed through `make` commands. No cloud lock-in.

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
- Printable / PDF receipts (A4 + 80 mm thermal)
- Offline POS (Dexie/IndexedDB): branch catalogue cache + idempotent sale queue that flushes on reconnect
- Shift-based: clock in/out, opening float, closing cash & variance

**Inventory**
- Stock receiving with **batches, expiry tracking and cost prices**; FEFO consumption on every sale
- Low-stock and expiring-soon views; per-branch stock; CSV bulk import; one-click KEML catalog seed
- **Controlled-substances register** for PPB narcotics compliance

**Catalogue**
- Products with brand/generic, GTIN, strength, dosage form, pack sizes, images (MinIO)
- Two-level categories, suppliers (with a default supplier per product), max-discount rules

**Appointments & reminders**
- Book and monitor recurring clinical visits (e.g. Depo‑Provera, vaccinations)
- Auto next-dose suggestion for recurring services
- **Email + SMS + WhatsApp reminders** the day before, with per-customer opt-in (SMS is billable)
- Tenant-managed service list (Settings → Services)

**Management**
- Dashboards & reports (sales, inventory, financial) — all in `Africa/Nairobi` time
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
| Database | **PostgreSQL 16** — Row-Level Security, two roles (`app_owner` / `app_authenticated`) |
| ORM | **Drizzle ORM** (postgres.js driver) |
| Migrations | **dbmate** (raw SQL — allows hand-written RLS policies/functions) |
| Auth | **Better Auth** (organization + admin plugins, Drizzle adapter) + a custom PIN-login plugin |
| Cache/queue | **Redis** (ioredis) — product lookups, rate limiting, BullMQ jobs |
| Object storage | **MinIO** (S3-compatible, self-hosted) — product images + DB backups |
| Receipts/charts | `@react-pdf/renderer`, Recharts |
| Observability | GlitchTip / Sentry SDK (optional, env-gated) + pino |
| Billing | Paystack (optional, env-gated) |
| Messaging | Africa's Talking (SMS + WhatsApp) + Resend (email) |
| Proxy | Caddy 2 (automatic TLS) |
| Tooling | pnpm workspaces, Vitest, ESLint, GitHub Actions CI, Docker Compose, Makefile |

---

## Architecture

- **Monorepo** (pnpm workspaces): the Next.js app (`apps/web`), a BullMQ worker (`apps/worker`), and shared packages (`db`, `types`, …).
- **Multi-tenant by design:** the Better Auth `organization` is the tenant. Every domain table is org-scoped and enforced in the database with **RLS**. Tenancy is request-scoped via Postgres GUCs (`app.organization_id` / `app.role` / `app.branch_id`) set by `withTenant()` in `packages/db`, so isolation doesn't depend on application code being perfect.
- **Two DB roles:** `app_owner` (migrations/seed/admin, bypasses RLS as object owner) and `app_authenticated` (all app queries, RLS-enforced).
- **Auth:** Better Auth email/password + a PIN flow for cashiers (`/api/auth/sign-in/pin`). Invite/reset links land on `/auth/set-password?token=…`.
- **Edge/middleware:** `apps/web/proxy.ts` (Next 16's renamed middleware) does an optimistic cookie gate; public routes include auth, health, cron and webhooks.
- **Self-hosted, single VM:** Postgres + Redis + MinIO + the app + Caddy run via Docker Compose. The app is stateless and can scale horizontally behind Caddy.

---

## Project structure

```
pharmatrack/
├── apps/
│   ├── web/                  # Next.js application
│   │   ├── app/
│   │   │   ├── (auth)/        # login, set-password, reset, /auth/callback
│   │   │   ├── (dashboard)/   # dashboard, inventory, products, suppliers,
│   │   │   │                  #   appointments, staff, shifts, reports, settings
│   │   │   ├── (pos)/         # POS terminal
│   │   │   ├── (platform)/    # SaaS operator console (/platform)
│   │   │   └── api/           # route handlers (REST), cron, webhooks, health
│   │   ├── components/        # UI, feature components, theme, platform
│   │   ├── lib/               # auth (Better Auth), redis, api-auth, billing,
│   │   │                      #   notifications, appointments, storage (MinIO)
│   │   └── proxy.ts           # auth middleware (Next 16)
│   └── worker/               # BullMQ workers + cron scheduler
├── packages/
│   ├── db/                   # Drizzle schema, withTenant()/dbAdmin(), RLS test
│   └── types/                # shared TypeScript types
├── infra/
│   ├── compose.core.yml      # postgres, redis, minio + (app profile) web, worker
│   ├── db/init/              # role bootstrap on fresh DB init
│   └── migrations/           # dbmate SQL migrations (001_… onward)
├── docs/                     # USER_GUIDE, QA_CHECKLIST, ADRs
├── Dockerfile                # standalone production image
├── Caddyfile                 # reverse proxy + auto-TLS
├── Makefile                  # make up / db-migrate / test-rls / build-web …
└── CLAUDE.md                 # master engineering reference
```

---

## Getting started (development)

### Prerequisites
- **Node 22+**, **pnpm 9+**, **Docker** (for the data plane)

### 1. Install
```bash
pnpm install
```

### 2. Configure environment
```bash
cp .env.example .env       # fill in secrets (see Environment variables)
```

### 3. Bring up the data plane + apply migrations
```bash
make up           # postgres + redis + minio
make db-migrate   # dbmate applies infra/migrations/*.sql as app_owner
make test-rls     # (optional) prove two-org tenant isolation
```

### 4. Run the app
```bash
pnpm dev          # http://localhost:3000
```

First run? Hit `/setup` to create the platform (operator) admin, then provision a tenant from `/platform`.

> **Note:** the dev server runs with Webpack and a bounded heap. This is intentional — Next 16's default Turbopack dev watcher can exhaust memory on low-RAM machines. Production builds are unaffected.

---

## Environment variables

Defined in `.env.example`. Highlights:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres as `app_owner` (migrations, admin, Better Auth adapter) |
| `DATABASE_AUTHENTICATED_URL` | ✅ | Postgres as `app_authenticated` (RLS-enforced app queries) |
| `BETTER_AUTH_SECRET` | ✅ | Session signing secret (rotate regularly) |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | ✅ | Canonical app URL (cookies, links, callbacks) |
| `REDIS_URL` | ➖ | Cache / rate-limit / BullMQ (degrades to no-cache if unset) |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET_PRODUCTS` | ➖ | Product image uploads |
| `RESEND_API_KEY` / `EMAIL_FROM` | ➖ | Transactional + reminder email |
| `MPESA_*` | ➖ | M‑Pesa Daraja STK push at the till |
| `AFRICASTALKING_*` | ➖ | SMS + WhatsApp reminders |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` | ➖ | Automated subscription billing |
| `CRON_SECRET` | ➖ | Protects the reminder cron endpoint |
| `GLITCHTIP_DSN` / `NEXT_PUBLIC_GLITCHTIP_DSN` | ➖ | Error tracking |

Every optional integration **degrades gracefully** — the app runs without it; the related feature simply stays inactive until configured.

---

## Database & migrations

- The **source of truth** is `infra/migrations/*.sql`, applied in order by **dbmate** (`make db-migrate`).
- `packages/db` holds the **Drizzle schema** that mirrors those migrations and is the typed query layer; `withTenant(orgId, fn)` opens an RLS-scoped transaction, `dbAdmin()` is the privileged pool.
- RLS is enabled on every tenant table; the two roles (`app_owner` / `app_authenticated`) are created by `infra/db/init` on fresh DB init.
- `make test-rls` runs the two-org isolation suite (`packages/db/tests/rls-isolation.mts`) — keep it green before merging schema changes.

---

## Testing & CI

```bash
pnpm --filter web typecheck   # tsc --noEmit
pnpm --filter web lint        # eslint
pnpm --filter web test        # vitest
make test-rls                 # two-org RLS isolation suite
pnpm --filter web build       # production (standalone) build
```

**GitHub Actions** (`.github/workflows/ci.yml`) runs typecheck → lint → test → build on every push and PR.

For manual release testing, use the **[QA checklist](docs/QA_CHECKLIST.md)**.

---

## Deployment

Self-hosted on a single VM (or split: app VM + ops VM) via Docker Compose. The repo ships a multi-stage **`Dockerfile`** (Next standalone output, non-root, healthcheck) and **`infra/compose.core.yml`**.

```bash
cp .env.example .env          # fill production values
make up                       # postgres + redis + minio
make db-migrate               # apply migrations
make up-app                   # build + run web + worker (the `app` profile)
```

`Caddyfile` terminates TLS (automatic Let's Encrypt) and reverse-proxies the `web` service — point `APP_DOMAIN`'s A record at the VM. TLS is required: the offline PWA service worker, the camera barcode scanner, and M‑Pesa callbacks all need HTTPS.

To run the production server locally without Docker:
```bash
make build-web && make start-web   # Next standalone server, loads .env
```

- **Health check:** `GET /api/health` for load balancers / uptime monitors.
- **Reminders:** any scheduler hitting `GET /api/cron/appointment-reminders` with the `CRON_SECRET` bearer token (the worker also schedules jobs).

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full runbook (VM sizing, DNS, backups, rollback).

---

## The SaaS / operator layer

PharmaTrack is built to be **operated as a service**:

- **Tenants** = organizations. Each has a `subscription` (status: trialing/active/past_due/suspended/cancelled) on a `plan`.
- The **platform console** at `/platform` (platform admins only) lists tenants, provisions new pharmacies (creates the org + owner invite + branch + services + subscription), changes plans/status, extends paid-until/trial, suspends/reactivates, and records payments.
- **Access gating:** if a tenant's subscription isn't active/trialing, its staff see an "Access paused" screen.
- **Billing:** manual (operator records payments) **or** automated via Paystack (`/api/webhooks/paystack` activates and extends the subscription on `charge.success`).

The first platform admin is created at `/setup` (self-locks afterwards); grant further operator access by adding a user's id to the `platform_admin` table.

---

## Integrations

| Integration | Enables | How to turn on |
|---|---|---|
| **M‑Pesa (Daraja)** | STK push payments at the till | Set `MPESA_*` |
| **Africa's Talking** | SMS + WhatsApp appointment reminders | Set `AFRICASTALKING_*` |
| **Resend** | Transactional + reminder email | Set `RESEND_API_KEY` / `EMAIL_FROM` |
| **Paystack** | Card + M‑Pesa subscription billing | Set `PAYSTACK_SECRET_KEY`; add the webhook `{APP_URL}/api/webhooks/paystack` |
| **MinIO** | Product image uploads + DB backups | Set `MINIO_*` |
| **GlitchTip / Sentry** | Error tracking | Set `GLITCHTIP_DSN` / `NEXT_PUBLIC_GLITCHTIP_DSN` |
| **Redis** | Faster lookups, rate limiting, background jobs | Set `REDIS_URL` |

---

## Security

- **Tenant isolation** enforced in Postgres via RLS — not just in app code.
- **Role-based access** (owner/manager/pharmacist/cashier) on every write API.
- **Controlled-substances register** for regulatory traceability.
- **Webhooks** are signature-verified (Paystack HMAC) and idempotent.
- **Cron** endpoint requires a bearer secret; **platform** APIs require platform-admin.
- Secrets via environment / Docker secrets; never commit `.env`.

---

## Roadmap

- KRA eTIMS fiscal invoicing + SHA/NHIF digital claims (optional Phase 8 add-ons)
- Public self-serve signup (today pharmacies are provisioned by the operator)
- Per-plan limits & feature gating
- End-to-end (Playwright) test suite
- Deeper analytics & data export

---

*Built for Kenyan pharmacies. For day-to-day usage, see the **[User Guide](docs/USER_GUIDE.md)**.*
