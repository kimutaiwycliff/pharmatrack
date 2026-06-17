-- migrate:up
-- ============================================================================
-- ADR-001 — RLS via dual roles + GUC-based tenancy helpers.
--
-- Tenancy is request-scoped through GUCs set by packages/db `withTenant()`:
-- app.organization_id / app.role / app.branch_id (read by the helpers below).
--
-- Roles (passwords come from the DB init / env, NOT this migration):
--   app_owner          owns objects → bypasses RLS (migrations, seed, platform).
--   app_authenticated  granted DML, NOBYPASSRLS → all tenant traffic, RLS-enforced.
--
-- Apply this ONLY at cutover (it switches the helpers off PostgREST/auth.uid()).
-- ============================================================================

-- 1) Ensure roles exist (NOLOGIN here; the Postgres container init grants LOGIN +
--    passwords from env). Safe/idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE app_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_authenticated') THEN
    CREATE ROLE app_authenticated NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- 2) Tenancy helper functions now read request GUCs instead of auth.uid().
--    `true` second arg => return NULL (not error) when the GUC is unset.
-- Org ids are TEXT (they are Better Auth organization ids).
CREATE OR REPLACE FUNCTION public.user_organization_id() RETURNS text
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$ SELECT nullif(current_setting('app.organization_id', true), '') $$;

CREATE OR REPLACE FUNCTION public.user_role() RETURNS text
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$ SELECT nullif(current_setting('app.role', true), '') $$;

CREATE OR REPLACE FUNCTION public.user_branch_id() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$ SELECT nullif(current_setting('app.branch_id', true), '')::uuid $$;

-- 3) Privileges. app_authenticated can use the schema + sequences and run DML on
--    existing and future tables; RLS policies (already deny-by-default and keyed on
--    user_organization_id()) do the actual isolation.
GRANT USAGE ON SCHEMA public TO app_authenticated, app_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_authenticated;

-- 4) Tables must FORCE RLS so the owner connection doesn't accidentally bypass it
--    in app paths. (Run per-table in the table migrations; example:)
--    ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
--    ALTER TABLE public.<t> FORCE ROW LEVEL SECURITY;

-- migrate:down
CREATE OR REPLACE FUNCTION public.user_organization_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$ SELECT organization_id FROM public.profiles WHERE id = auth.uid() $$;
CREATE OR REPLACE FUNCTION public.user_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
CREATE OR REPLACE FUNCTION public.user_branch_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$ SELECT branch_id FROM public.profiles WHERE id = auth.uid() $$;
