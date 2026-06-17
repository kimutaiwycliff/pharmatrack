# PharmaTrack — single-VM deployment (self-hosted)

Everything runs on one VM via Docker Compose: **PostgreSQL 16** (RLS, two roles),
**Redis** (cache + BullMQ), **MinIO** (object storage), the **Next.js app**
(standalone), a **BullMQ worker**, and **Caddy** (automatic HTTPS). TLS is
mandatory — the offline PWA service worker, the camera barcode scanner, and
M‑Pesa callbacks all require HTTPS.

```
                    ┌──────────────── VM ────────────────┐
   Internet ──443──▶│ Caddy ─▶ web (Next standalone)      │
                    │            │   │   │                │
                    │       postgres redis minio   worker │
                    └─────────────────────────────────────┘
```

The whole stack is driven by `make` (see the [Makefile](Makefile)) and `dbmate`
migrations in `infra/migrations/`. There is no external backend service — no
cloud database, no managed auth.

---

## Local end-to-end test first — recommended before the VM

```bash
git clone <repo> pharmatrack && cd pharmatrack
pnpm install
cp .env.example .env            # fill in dev values (see below)
make up                         # postgres + redis + minio (Docker)
make db-migrate                 # apply infra/migrations/*.sql via dbmate
make test-rls                   # prove two-org tenant isolation (optional)
pnpm dev                        # http://localhost:3000
```

Open **http://localhost:3000** → first load redirects to `/setup` (create the
platform admin) → `/platform` (provision a pharmacy).

To exercise the **production** server locally (standalone build, service worker
registers, no Docker for the app):

```bash
make build-web && make start-web   # node .next/standalone server, loads .env
```

Other handy targets: `make down` (stop stack), `make logs`, `make db-shell`,
`make clean` (wipe data volumes), `make help`.

---

## 0. Prerequisites (production VM)

- A VM (Ubuntu 22.04+, **≥ 4 GB RAM**, 8 GB recommended — Postgres + app + build are memory-hungry).
- A domain with an A record for the app, e.g. `pos.yourdomain.co.ke` → the VM IP.
- Docker Engine + Compose plugin:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this
```

## 1. Configure the environment

```bash
git clone <repo> pharmatrack && cd pharmatrack
cp .env.example .env
```

Fill in `.env` (used for **both** the image build and runtime):

- `POSTGRES_PASSWORD`, `APP_OWNER_PASSWORD`, `APP_AUTHENTICATED_PASSWORD` — strong passwords.
- `DATABASE_URL=postgres://app_owner:<APP_OWNER_PASSWORD>@postgres:5432/pharmatrack`
- `DATABASE_AUTHENTICATED_URL=postgres://app_authenticated:<APP_AUTHENTICATED_PASSWORD>@postgres:5432/pharmatrack`
- `BETTER_AUTH_SECRET` — 32+ random chars.
- `BETTER_AUTH_URL=https://pos.yourdomain.co.ke`, `NEXT_PUBLIC_APP_URL=https://pos.yourdomain.co.ke`, `APP_DOMAIN=pos.yourdomain.co.ke`
- `REDIS_URL=redis://redis:6379`
- `MINIO_ENDPOINT=minio`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_PRODUCTS=pharmatrack-products`
- `RESEND_API_KEY` / `EMAIL_FROM` — **required** for staff invites + password recovery to deliver.
- `MPESA_*` with `MPESA_CALLBACK_URL=https://pos.yourdomain.co.ke/api/mpesa/callback` (only if using M‑Pesa).
- `CRON_SECRET` — any long random string.
- `AFRICASTALKING_*`, `PAYSTACK_*`, `GLITCHTIP_DSN` — as needed.

> **Build-time note:** `NEXT_PUBLIC_*` are inlined into the browser bundle when the
> image is **built**, so they must be set in `.env` before `make up-app`. Compose
> passes them as build args. Change `NEXT_PUBLIC_APP_URL` later → rebuild, don't
> just restart.

## 2. Bring up the data plane + apply the schema

```bash
make up           # starts postgres, redis, minio
make db-migrate   # dbmate applies infra/migrations/*.sql as app_owner
```

`infra/db/init` creates the `app_owner` / `app_authenticated` roles on the
postgres volume's first init. The migrations create every table, enable RLS, and
seed reference data (plans, KEML drug catalog).

Create the product-image bucket once (via the MinIO console at `:9001`, or `mc`):

```bash
docker run --rm --network pharmatrack_default --entrypoint sh minio/mc -c "\
  mc alias set m http://minio:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY && \
  mc mb -p m/pharmatrack-products && mc anonymous set download m/pharmatrack-products"
```

## 3. Build and run the app + worker

```bash
make up-app       # builds the image and starts web + worker (the `app` profile)
```

The `web` service publishes `:3000`. Put **Caddy** in front for TLS using the
repo `Caddyfile` (it reverse-proxies `web:3000` and fetches a Let's Encrypt cert
for `APP_DOMAIN`) — run it on the host or add a `caddy` service sharing the
compose network. Then visit `https://pos.yourdomain.co.ke`.

## 4. First run (operator → subscriber → staff)

1. **Create the platform admin.** Open the app — with an empty database you're
   sent to **`/setup`** to create the operator account (email + password). It
   self-locks once an admin exists; you land in `/platform` signed in.
2. **Add a subscriber.** In `/platform`, provision a tenant (pharmacy name +
   owner name + owner email). This creates the org, a default branch, a 14-day
   trial subscription, default services, and **emails the owner a set-password link**.
3. **Owner takes over.** The owner opens the link (`/auth/set-password?token=…`),
   sets a password, and lands in their dashboard, where they:
   - **Load Kenyan drug catalog** (Inventory) — seeds products inactive/unpriced;
     set prices and activate, or **Unseed** to remove untouched ones.
   - Add opening stock via **Receive Stock** or **Import CSV**.
   - Invite **staff**, set quick-login PINs (phone + 4-digit PIN), configure settings.

> Resend must be configured (step 1) for invite/recovery emails to arrive.

## 5. Verify offline (production image only — the SW doesn't register in `next dev`)

1. Open `https://pos.yourdomain.co.ke/pos` online once (installs the service
   worker, caches the app shell + the whole branch catalogue into IndexedDB).
2. DevTools → Network → **Offline** (or disconnect).
3. Reload `/pos` — it should still load, search, scan, and complete a cash sale.
4. Go back **online** — a "Synced N offline sales" toast confirms the queue flushed.

## 6. M-Pesa

Register `https://pos.yourdomain.co.ke/api/mpesa/callback` as the Daraja
confirmation/validation URL. It must be public HTTPS (Caddy provides this).

## 7. Backups & ops

- **Postgres:** schedule `pg_dump` (or pgBackRest → MinIO) off-box daily. `make db-shell` for a psql session.
- **MinIO:** mirror the `pharmatrack-products` bucket and DB-backup bucket off-box.
- **Redis:** cache + queue; AOF persistence is on for warm restarts, but it's safe to lose.
- **Caddy:** the `caddy-data` volume holds certs — keep it.
- **Logs:** `make logs` (or `docker compose -p pharmatrack -f infra/compose.core.yml logs -f web worker`).
- **Update:** `git pull && make db-migrate && make up-app`.
- **Rollback:** redeploy the previous image tag and `make db-rollback` if a migration must be reverted.

## Notes

- The reminder cron hits `/api/cron/appointment-reminders` with the `CRON_SECRET`
  bearer token; the BullMQ worker also schedules background jobs.
- RLS is the tenant boundary. Before shipping schema changes, keep `make test-rls`
  green — it proves two orgs cannot see each other's rows.
