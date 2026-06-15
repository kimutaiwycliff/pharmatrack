# ADR-001 — Multi-tenancy via Postgres RLS + `SET LOCAL` + dual roles
**Status:** Accepted · **Date:** 2026-06

Tenant isolation is enforced in Postgres, not the app. Two roles: `app_owner`
(migrations, seed, platform/service — bypasses RLS) and `app_authenticated`
(all tenant traffic — RLS-enforced, not table owner, NOBYPASSRLS). Per request,
`withTenant(orgId, fn)` opens a transaction as `app_authenticated` and sets
`app.organization_id` via `set_config(..., true)`; policies read
`current_setting('app.organization_id', true)`. Deny by default. The two-org
isolation test (`make test-rls`) gates every merge.
