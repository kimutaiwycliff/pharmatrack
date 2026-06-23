-- Postgres initdb hook (runs once on a fresh data dir, as the superuser).
-- Installs extensions the migrations rely on but app_owner can't create itself
-- (CREATE EXTENSION needs privileges app_owner doesn't have). pg_trgm powers the
-- trigram search indexes in migration 012.
--
-- For an EXISTING database (init won't re-run), install it once as superuser:
--   docker exec <postgres> psql -U postgres -d pharmatrack -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"

CREATE EXTENSION IF NOT EXISTS pg_trgm;
