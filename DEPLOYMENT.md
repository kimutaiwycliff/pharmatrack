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

## 0. Prerequisites
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
