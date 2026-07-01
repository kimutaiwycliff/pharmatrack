-- migrate:up
-- Soft-delete schedule for tenants. An operator schedules deletion; the tenant is
-- blocked (subscription set to 'cancelled') and, after the grace window, a cron
-- purges the org (cascading all its data). Cancelling before then restores access.
CREATE TABLE tenant_deletion (
  organization_id         text PRIMARY KEY REFERENCES "organization"("id") ON DELETE CASCADE,
  scheduled_purge_at      timestamptz NOT NULL,
  requested_at            timestamptz NOT NULL DEFAULT now(),
  requested_by            text REFERENCES "user"("id"),
  prev_subscription_status text,
  reason                  text
);

CREATE INDEX idx_tenant_deletion_due ON tenant_deletion (scheduled_purge_at);

-- Operator-only: enable RLS with NO app_authenticated policy, so only app_owner
-- (operator/service via dbAdmin) can read or write it. Same pattern as
-- platform_admin / subscription.
ALTER TABLE tenant_deletion ENABLE ROW LEVEL SECURITY;

-- migrate:down
DROP TABLE IF EXISTS tenant_deletion;
