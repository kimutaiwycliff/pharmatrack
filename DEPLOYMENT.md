# PharmaTrack — single-VM deployment (self-hosted)

Everything runs on one VM via Docker Compose: **PostgreSQL 16** (RLS, two roles),
**Redis** (cache), **MinIO** (object storage), the **Next.js app** (standalone),
a small **worker** (a dependency-free scheduler that drives the appointment-reminder
cron; the future home for queue jobs), and **Caddy** (automatic HTTPS). TLS is
mandatory in production — the offline PWA service worker, the camera barcode
scanner, and M‑Pesa callbacks all require HTTPS.

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

The same compose file (`infra/compose.core.yml`) drives every environment via
profiles, so a local mirror and the VM are the **same containers**:

| Command | Brings up | TLS / URL |
|---|---|---|
| `make up` | postgres, redis, minio | — (data plane only) |
| `make up-app` | + web, worker | http://localhost:3000 (no TLS) — **local production mirror** |
| `make up-prod` | + web, worker, **caddy** | https://`$APP_DOMAIN` (Let's Encrypt) — **VM** |

`up-app` and `up-prod` build and run the *production* image (Next standalone,
service worker active) — not `next dev`. The only differences between them are
Caddy/TLS and the `NEXT_PUBLIC_APP_URL` baked into the build (localhost vs your
domain).

---

## A. Local production mirror — the whole stack in Docker

Run the exact production containers (web + worker + data plane) on your laptop at
**http://localhost:3000**, with no TLS and no domain. Recommended before touching
the VM — if this works, the VM is the same thing plus Caddy.

```bash
git clone <repo> pharmatrack && cd pharmatrack
cp .env.example .env
```

`.env.example` already has working local defaults. For a mirror you only need to
set the secrets and the URLs:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000      # baked into the build (see note)
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=any-long-random-string-at-least-32-chars
CRON_SECRET=any-long-random-string
RESEND_API_KEY=...                             # needed for invite/recovery emails
```

> **Leave `DATABASE_URL` / `REDIS_URL` / `MINIO_ENDPOINT` as the `localhost:…`
> defaults.** Those are for host tools (`pnpm dev`, tests). For the containers,
> compose overrides them with the in-network service names (`postgres:5432`,
> `redis:6379`, `minio`) automatically — so the same `.env` serves both.

```bash
make up           # 1. data plane: postgres, redis, minio
make db-migrate   # 2. apply infra/migrations/*.sql (dbmate, as app_owner)
make up-app       # 3. build the production image, start web + worker
```

Create the product-image bucket once (see step B.2 for the `mc` one-liner), then
open **http://localhost:3000** → `/setup` (create platform admin) → `/platform`
(provision a pharmacy). The worker is already polling the reminder cron on its
interval — watch it with `make logs`.

Tear down with `make down` (keeps data) or `make clean` (wipes the volumes).

> **Why Docker and not `pnpm dev`?** `next dev` is for editing code, but it does
> **not** register the PWA service worker and is not the production build. The
> mirror above runs the real standalone image, so offline POS, the SW, and the
> worker all behave exactly as they will on the VM.

### Dev mode (editing code)

For an inner loop with hot reload, run the data plane in Docker and the app on the
host instead:

```bash
make up && make db-migrate
pnpm install && pnpm dev        # http://localhost:3000, hot reload, no SW
make test-rls                   # optional: prove two-org tenant isolation
```

Handy targets: `make logs`, `make db-shell`, `make help` (lists all).

---

## B. Production on a VM

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
- `RESEND_API_KEY` / `RESEND_FROM` — **required** for staff invites + password recovery to deliver.
- `MPESA_*` with `MPESA_CALLBACK_URL=https://pos.yourdomain.co.ke/api/mpesa/callback` (only if using M‑Pesa).
- `CRON_SECRET` — any long random string.
- `AFRICASTALKING_*`, `PAYSTACK_*`, `GLITCHTIP_DSN` — as needed.

> The `DATABASE_URL` / `REDIS_URL` / `MINIO_ENDPOINT` lines above are what the
> **host** tools use; for the containers, compose derives the in-network endpoints
> (`postgres:5432`, `redis:6379`, `minio`) from the service names + the password
> vars, so just keep those passwords correct.

> **Build-time note:** `NEXT_PUBLIC_*` are inlined into the browser bundle when the
> image is **built**, so they must be set in `.env` before `make up-app` / `up-prod`.
> Compose passes them as build args. Change `NEXT_PUBLIC_APP_URL` later → rebuild,
> don't just restart.

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

## 3. Build and run the app + worker + Caddy

```bash
make up-prod      # builds the image and starts web + worker + caddy
```

This adds the `edge` profile on top of `app`, so it starts **web**, **worker**,
and **caddy** together. Caddy (repo `Caddyfile`) binds `:80`/`:443`, reverse-proxies
`web:3000`, and fetches a Let's Encrypt cert for `APP_DOMAIN` automatically. Make
sure ports 80 and 443 are open on the VM and the DNS A record already points here,
then visit `https://pos.yourdomain.co.ke`.

> Certs persist in the `caddy-data` volume — don't delete it. Use `make up-app`
> (no Caddy) only if you front the stack with your own proxy/load balancer.

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
- **Redis:** cache today (queue later); AOF persistence is on for warm restarts, but it's safe to lose.
- **Caddy:** the `caddy-data` volume holds certs — keep it.
- **Logs:** `make logs` (or `docker compose -p pharmatrack -f infra/compose.core.yml logs -f web worker`).
- **Update:** `git pull && make db-migrate && make up-prod` (or `make up-app` if you run your own proxy).
- **Rollback:** redeploy the previous image tag and `make db-rollback` if a migration must be reverted.

---

## C. Deploy to AWS EC2 + Cloudflare (pull-based — recommended for small hosts)

Section B builds the image on the box. On a small VM that won't work (a Next
build needs ~3 GB). Instead **pull the published image** with
`infra/compose.prod.yml` + `infra/deploy.sh`. The image is built once in CI / on
a dev machine (`docker build --build-arg NEXT_PUBLIC_APP_URL=https://pharmatrack.co.ke …`)
and pushed to `kimutaiwycliff/pharmatrack-web`.

> `NEXT_PUBLIC_APP_URL` is **baked into the browser bundle at build time**. The
> published image must be built with the production URL — rebuild + repush if the
> domain changes.

### C.0 EC2 prerequisites
- **Size:** ≥ 4 GB RAM (8 GB recommended). 2 GB will OOM under load.
- **Elastic IP:** allocate + associate one **before** resizing — stopping the
  instance to change type otherwise changes the public IP (breaking DNS + SSH).
- **Security group inbound:** `22` (SSH, ideally your IP only), `80` and `443`
  (Caddy). Do **not** open 5432 / 6379 / 9000 / 9001 — `compose.prod.yml` binds
  those to localhost, reach them via an SSH tunnel.
- **Swap:** add ~4 GB so memory spikes don't OOM:
  ```bash
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

### C.1 Install Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # re-login after this
```

### C.2 Stage the deploy files
The server needs the repo's `infra/`, root `Caddyfile`, and `.env` (not the app
source — the app ships as the image). From your laptop:
```bash
rsync -av --exclude node_modules --exclude .next --exclude .git \
  ./ ubuntu@<elastic-ip>:~/pharmatrack/
```
(or `git clone` the repo on the box with a deploy token.)

### C.3 Production `.env`
On the server, in `~/pharmatrack/.env` — generate strong secrets:
```bash
openssl rand -base64 24   # use for each password/secret below
```
Required:
```env
NODE_ENV=production
APP_DOMAIN=pharmatrack.co.ke
NEXT_PUBLIC_APP_URL=https://pharmatrack.co.ke
BETTER_AUTH_URL=https://pharmatrack.co.ke
BETTER_AUTH_SECRET=<32+ random chars>
POSTGRES_DB=pharmatrack
POSTGRES_PASSWORD=<random>
APP_OWNER_PASSWORD=<random>
APP_AUTHENTICATED_PASSWORD=<random>
REDIS_URL=redis://redis:6379
MINIO_ACCESS_KEY=<random>
MINIO_SECRET_KEY=<random>
MINIO_BUCKET_PRODUCTS=pharmatrack-products
RESEND_API_KEY=<real>          # required for invites / OTP / password reset
RESEND_FROM=PharmaTrack <no-reply@pharmatrack.co.ke>
CRON_SECRET=<random>
PLATFORM_NOTIFY_EMAIL=you@pharmatrack.co.ke
```
Optional (features stay off until set): `GOOGLE_CLIENT_ID/SECRET`,
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (note the site key is
build-time — needs a rebuilt image), `MPESA_*`, `PAYSTACK_*`, `AFRICASTALKING_*`.

> The container's DB/Redis/MinIO hostnames are set to the in-network service
> names by `compose.core.yml`, so the `.env` values are used by the deploy
> script (dbmate, MinIO bucket) — keep the passwords consistent.

### C.4 Cloudflare DNS + TLS
Add an **A record**: `pharmatrack.co.ke → <elastic-ip>` (and a `www` CNAME/A if
wanted). The TLS mode is selected by the `CADDYFILE` env var — both are wired in.

**Grey cloud (DNS-only) — recommended first, zero config:**
1. DNS record **Proxy status: DNS only** (grey).
2. Security group: open **80** + **443** (Caddy needs 80 for the ACME challenge).
3. Leave `CADDYFILE` unset → the default `Caddyfile` is used; Caddy fetches and
   renews a Let's Encrypt cert automatically.
4. Deploy once DNS resolves to the box.

**Orange cloud (proxied) — CDN/DDoS, one flip:**
1. Cloudflare → SSL/TLS → set mode to **Full (strict)**.
2. SSL/TLS → Origin Server → **Create Certificate** (hostnames `pharmatrack.co.ke`,
   `*.pharmatrack.co.ke`). Save the cert + key to `infra/certs/origin.pem` and
   `infra/certs/origin.key` on the server (`chmod 600` the key; both are gitignored).
3. In `.env` set: `CADDYFILE=../Caddyfile.cloudflare`
4. DNS record **Proxy status: Proxied** (orange). Security group: keep **443**
   open (optionally restrict to Cloudflare IP ranges); 80 can be closed.
5. Re-run `./infra/deploy.sh`.

`Caddyfile.cloudflare` serves the Origin Certificate (no ACME) and forwards the
real client IP from Cloudflare's `CF-Connecting-IP` header so rate limiting /
Turnstile / logs see the actual visitor, not a Cloudflare node. Switch back to
grey by unsetting `CADDYFILE` and redeploying.

### C.5 Deploy

**One command, from your dev machine (recommended):**
```bash
./scripts/release.sh
```
It cross-builds `linux/amd64`, **verifies the push actually landed** (via the
build metadata digest), **rsyncs `infra/` — including migrations — to the box**,
runs the on-box deploy, and confirms the just-pushed image is the one running.
This closes the three traps we hit: arm64 images on an amd64 host, a silent
Docker-Hub push failure, and the image deploying ahead of its migrations.

**On-box only (first run / manual):**
```bash
cd ~/pharmatrack && ./infra/deploy.sh
```
It pulls the image, starts the data plane, applies migrations, ensures the MinIO
bucket, then starts web + worker + Caddy and health-checks. ⚠️ This does NOT ship
new migration files — if you added migrations, `rsync` `infra/` to the box first
(or just use `scripts/release.sh`). Then open `https://pharmatrack.co.ke` →
`/setup` to create the platform operator.

## Notes

- The **worker** (`apps/worker/server.js`) is a small dependency-free scheduler
  that calls two idempotent, `CRON_SECRET`-guarded endpoints on an interval:
  `/api/cron/appointment-reminders` (default hourly, override with
  `REMINDER_INTERVAL_MS`) and `/api/cron/subscription-expiry` (default every 6h,
  override with `SUBSCRIPTION_SWEEP_INTERVAL_MS`) — the latter flips
  `trialing`/`active` subscriptions to `past_due`/`suspended` once
  `trial_ends_at`/`current_period_end` has passed, so a lapsed trial or unpaid
  renewal actually loses access instead of a stale status lingering forever.
  Both targets are controlled by `CRON_TARGET_URL` in `.env`. It's the future
  home for a BullMQ worker; no queue jobs run yet.
- RLS is the tenant boundary. Before shipping schema changes, keep `make test-rls`
  green — it proves two orgs cannot see each other's rows.
