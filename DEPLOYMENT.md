# PharmaTrack — Pure-VM deployment (self-hosted Supabase + Redis)

This deploys everything on a single VM: **self-hosted Supabase** (Postgres,
Auth, Storage, REST), **Redis** (cache), the **Next.js app**, and **Caddy**
(automatic HTTPS). TLS is mandatory — the offline PWA service worker, the
camera barcode scanner, and M-Pesa callbacks all require HTTPS.

```
                    ┌─────────────── VM ───────────────┐
   Internet ──443──▶│ Caddy ─▶ web (Next standalone) ─▶ redis
                    │   │                  │            │
                    │   └─▶ supabase-kong ─┴─▶ postgres / gotrue / storage
                    └───────────────────────────────────┘
```

---

## Local end-to-end test first (Ubuntu) — recommended before the VM

The Caddy/HTTPS stack above is for the public VM. To validate a fresh clone
end-to-end on your laptop with the least friction, use the Supabase CLI for the
backend and run the app's production build directly (so the offline PWA service
worker is active — it only registers in production, and `http://localhost` is a
secure context so no TLS is needed).

**Prereqs:** Docker, Node 22 + pnpm (`corepack enable`), and the Supabase CLI
(`npx supabase` works, or install it).

```bash
# 1. From the repo root — start a clean local Supabase (Postgres/Auth/Storage/Studio)
supabase start
#    Applies every migration in supabase/migrations (incl. the Kenyan drug
#    catalog). Does NOT load demo data — a true fresh install.
supabase status          # copy the API URL + anon key + service_role key
```

```bash
# 2. Point the app at local Supabase (pnpm reads apps/web/.env.local)
cp apps/web/.env.local.example apps/web/.env.local
# edit apps/web/.env.local:
#   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase status`>
#   SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`>
#   REDIS_URL=                      # leave empty → cache falls back to the DB
#   NEXT_PUBLIC_APP_URL=http://localhost:3000
#   (M-Pesa/SMS/email can stay as placeholders for this test)
```

```bash
# 3. Build + run the production server (service worker registers in prod)
pnpm install
pnpm build
pnpm --filter web start          # http://localhost:3000
```

**Walk the whole flow as a brand-new install:**
1. Open `http://localhost:3000` → you're redirected to **`/setup`** → create the
   platform admin → you land in `/platform`.
2. In `/platform`, **add a subscriber** (pharmacy + owner email). The owner's
   invite email appears in **Inbucket → http://localhost:54324** (no SMTP needed
   locally) — open it, accept, set a password.
3. As the owner: Inventory → **Load Kenyan drug catalog** → set a price + activate
   an item → add stock (Receive/Import) → make a sale at **/pos**.
4. **Offline test:** with `/pos` open, DevTools → Network → **Offline**, reload,
   search/scan, complete a sale; go back online → "Synced N offline sales" toast.

> Optional: create the image bucket if you want to test product photos —
> Studio (http://localhost:54323) → Storage → new public bucket `product-images`.

### Want everything dockerized, like production?

The CLI path above runs Supabase in Docker, but they're the CLI's dev images.
For the **same images as production** (self-hosted Supabase compose + our app +
Redis), use the fully-dockerized local path on Linux:

1. Run the self-hosted Supabase docker stack (DEPLOYMENT.md §1) → Kong on
   `http://localhost:8000`. Apply migrations to it (§2, `--db-url` =
   `postgresql://postgres:<pw>@localhost:5432/postgres`).
2. In the root `.env` set (these are used for **both build and runtime**):
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase .env>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase .env>
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   REDIS_URL=redis://localhost:6379
   ```
3. Build + run only the app + Redis (Caddy/cron stay off):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build web redis
   ```
   Open `http://localhost:3000`. This uses the production Dockerfile and runs
   the app on the host network so it reaches Supabase/Redis on localhost.

The **only** production element not reproduced locally is Caddy + public TLS
(Let's Encrypt needs a real domain). Validate that on the real VM, or in a local
VM using Caddy's internal CA (`tls internal`) with a `/etc/hosts` entry.

> **Build-time note (applies everywhere):** `NEXT_PUBLIC_*` are inlined into the
> browser bundle when the image is **built**, so they must be set in `.env`
> *before* `docker compose ... up --build`. Compose passes them as build args.
> Change the Supabase URL later → rebuild the image, don't just restart.

---

## 0. Prerequisites (production VM)
- A VM (Ubuntu 22.04+, **≥ 4 GB RAM**, 8 GB recommended; Supabase + app + build are memory-hungry).
- A domain with two A records pointing at the VM IP:
  - `pos.yourdomain.co.ke` → the app
  - `supabase.yourdomain.co.ke` → the Supabase API gateway (Kong)
- Docker Engine + Compose plugin installed.

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this
```

## 1. Stand up self-hosted Supabase
Follow https://supabase.com/docs/guides/self-hosting/docker.

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Edit `supabase/docker/.env` and set **all** of:
- `POSTGRES_PASSWORD` — strong password.
- `JWT_SECRET` — 40+ random chars; then generate matching `ANON_KEY` and
  `SERVICE_ROLE_KEY` (use the generator in the Supabase self-hosting docs).
- `SITE_URL=https://pos.yourdomain.co.ke` and add it to `ADDITIONAL_REDIRECT_URLS`.
- `API_EXTERNAL_URL=https://supabase.yourdomain.co.ke`.
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` for Studio.
- **SMTP** (`SMTP_HOST/PORT/USER/PASS/SENDER_NAME/ADMIN_EMAIL`) — **required**,
  or staff invites and password recovery emails silently fail.

Start it:

```bash
docker compose up -d
```

**Serving Supabase through this repo's Caddy (optional).** The `Caddyfile`
already has a `{$SUPABASE_DOMAIN}` block proxying to `kong:8000`. To use it,
Caddy must share a network with the Supabase containers. Set `SUPABASE_DOMAIN`
in `.env`, then attach Caddy to Supabase's network by adding to the `caddy`
service in `docker-compose.yml`:

```yaml
    networks: [default, supabase]
# and at the bottom of the file:
networks:
  supabase:
    external: true
    name: supabase_default   # the network name `docker network ls` shows for the Supabase stack
```

Otherwise leave `SUPABASE_DOMAIN` unset and expose Kong / terminate TLS via the
Supabase stack's own proxy.

## 2. Apply the schema (fresh, no demo data)
From a machine with the Supabase CLI and this repo. Use the **session pooler /
direct** DB URL of your self-hosted Postgres.

```bash
export SELF_HOST_DB="postgresql://postgres:POSTGRES_PASSWORD@supabase.yourdomain.co.ke:5432/postgres"
supabase db push --db-url "$SELF_HOST_DB"
```

This runs every migration in `supabase/migrations/`, including
`20260614090000_drug_catalog.sql` — so the shared **Kenyan drug catalog is
seeded automatically**. Do **not** run `supabase/seed/001_dev_seed.sql` or
`run-seed.ts`; those create demo orgs/products and we want a clean start.

> psql fallback (no CLI): `for f in supabase/migrations/*.sql; do psql "$SELF_HOST_DB" -f "$f"; done`

Create the storage bucket the product-image uploader expects (Studio → Storage,
or SQL):

```sql
insert into storage.buckets (id, name, public) values ('product-images','product-images', true)
on conflict (id) do nothing;
```

## 3. Configure and run the app
On the VM, in this repo:

```bash
cp apps/web/.env.local.example .env
```

Fill in `.env`:
- `NEXT_PUBLIC_SUPABASE_URL=https://supabase.yourdomain.co.ke`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — from Supabase `.env`.
- `DATABASE_URL` — self-hosted Postgres URL.
- `APP_DOMAIN=pos.yourdomain.co.ke`, `NEXT_PUBLIC_APP_URL=https://pos.yourdomain.co.ke`
- `REDIS_URL` — leave as-is; compose sets `redis://redis:6379`.
- `MPESA_*` with `MPESA_CALLBACK_URL=https://pos.yourdomain.co.ke/api/payments/mpesa/callback`.
- `CRON_SECRET` — any long random string.
- SMS/email keys if you use reminders.

Build and start (web + redis + caddy + reminder-cron):

```bash
docker compose up -d --build
```

Caddy fetches a certificate for `APP_DOMAIN` automatically. Visit
`https://pos.yourdomain.co.ke`.

## 4. First run (operator → subscriber → staff)
1. **Create the platform admin.** Open the app — with an empty database you're
   sent to **`/setup`** to create the operator account (email + password). This
   is one-time and self-locks once an admin exists; you land in `/platform`
   signed in.
2. **Add a subscriber.** In `/platform`, add a tenant (pharmacy name + owner
   name + owner email). This provisions the org, a default branch, a trial
   subscription, default services, and **emails the owner an invite**.
3. **Owner takes over.** The owner clicks the invite, sets a password, and lands
   in their dashboard, where they:
   - **Load Kenyan drug catalog** (Inventory) — seeds products inactive/unpriced;
     set prices and activate, or **Unseed** to remove untouched ones.
   - Add opening stock via **Receive Stock** or **Import CSV**.
   - Invite **staff**, set quick-login PINs, and configure settings.

> SMTP must be working (step 1) for the owner/staff invite emails to arrive.

## 5. Verify offline (must be the production image, not `next dev`)
The service worker only registers in production builds.
1. Open `https://pos.yourdomain.co.ke/pos` online once (installs the SW, caches
   the app shell + the whole branch catalogue into IndexedDB).
2. DevTools → Network → **Offline** (or disconnect the VM/client).
3. Reload `/pos` — it should still load, search, scan, and complete a sale.
4. Go back **online** — a "Synced N offline sales" toast confirms the queue flushed.

## 6. M-Pesa
Register `https://pos.yourdomain.co.ke/api/payments/mpesa/callback` as the
Daraja confirmation/validation URL. It must be public HTTPS (Caddy provides this).

## 7. Backups & ops
- **Postgres**: schedule `pg_dump` of the Supabase DB volume off-box daily.
- **Redis**: cache only — safe to lose (AOF persistence is on for warm restarts).
- **Caddy**: `caddy-data` volume holds certs; keep it.
- Logs: `docker compose logs -f web caddy`.
- Update: `git pull && docker compose up -d --build`.

## Notes
- Redis/Trigger.dev: `@upstash/redis`, `@upstash/ratelimit` and Trigger.dev are
  no longer required — the cache uses `ioredis` via `REDIS_URL`. The Upstash env
  vars remain supported as a managed fallback.
- The reminder cron replaces Vercel Cron; it hits `/api/cron/appointment-reminders`
  every 15 min using `CRON_SECRET`.
