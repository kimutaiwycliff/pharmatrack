#!/bin/sh
# Postgres initdb hook (runs once on a fresh data dir). Creates the two RLS roles
# with passwords taken from the ENVIRONMENT so production secrets are never
# hardcoded. The postgres entrypoint sources this (no exec bit needed → works on
# Docker Desktop's noexec bind mounts too).
#
# Passwords come from compose (APP_OWNER_PASSWORD / APP_AUTHENTICATED_PASSWORD,
# default to the dev values). Keep DATABASE_URL / DATABASE_AUTHENTICATED_URL in
# .env in sync with these. ADR-001: app_owner owns objects (bypasses RLS for
# migrations/platform/service); app_authenticated is RLS-enforced.
set -e

OWNER_PW="${APP_OWNER_PASSWORD:-app_owner}"
AUTH_PW="${APP_AUTHENTICATED_PASSWORD:-app_authenticated}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_owner') THEN
    CREATE ROLE app_owner LOGIN PASSWORD '${OWNER_PW}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_authenticated') THEN
    CREATE ROLE app_authenticated LOGIN PASSWORD '${AUTH_PW}' NOBYPASSRLS;
  END IF;
END \$\$;
GRANT CREATE, USAGE ON SCHEMA public TO app_owner;
GRANT USAGE ON SCHEMA public TO app_authenticated;
SQL
