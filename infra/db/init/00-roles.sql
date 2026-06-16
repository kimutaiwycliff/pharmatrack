-- Postgres initdb hook (runs once on a fresh data dir, via psql — no exec needed,
-- works on Docker Desktop's noexec bind mounts). Creates the two RLS roles.
-- ADR-001: app_owner owns objects (bypasses RLS for migrations/platform/service);
-- app_authenticated is RLS-enforced.
--
-- Dev-default passwords below. For production set strong ones here (or rotate via
-- ALTER ROLE after first init) — Postgres is on the internal network, not exposed.
-- Keep DATABASE_URL / DATABASE_AUTHENTICATED_URL in .env in sync with these.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_owner') THEN
    CREATE ROLE app_owner LOGIN PASSWORD 'app_owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_authenticated') THEN
    CREATE ROLE app_authenticated LOGIN PASSWORD 'app_authenticated' NOBYPASSRLS;
  END IF;
END $$;

GRANT CREATE, USAGE ON SCHEMA public TO app_owner;
GRANT USAGE ON SCHEMA public TO app_authenticated;
