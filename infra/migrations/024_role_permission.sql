-- migrate:up
-- Per-org overrides of the default role → capability matrix that lives in
-- packages/core/src/permissions.ts. Only cells the owner has flipped away from
-- the default are stored, so new capabilities reach every tenant with their
-- default automatically. The owner role is never stored (always all-access).
CREATE TABLE role_permission (
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('manager', 'pharmacist', 'cashier')),
  capability      text NOT NULL,
  allowed         boolean NOT NULL,
  updated_by      text REFERENCES "user"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, role, capability)
);

ALTER TABLE role_permission ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_permission_rls ON role_permission FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- migrate:down
DROP TABLE IF EXISTS role_permission;
