-- migrate:up
-- Tenancy / org-structure tables. organization & user come from Better Auth
-- (002). organization_id is TEXT (FK to Better Auth organization.id).
-- RLS is org-scoped via public.user_organization_id() (GUC). No FORCE: the
-- app_owner connection (table owner) bypasses RLS for platform/service work;
-- app_authenticated (NOBYPASSRLS, not owner) is always enforced.

CREATE TABLE branch (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  name            text NOT NULL,
  phone           text,
  address         text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_branch_org ON branch(organization_id);

-- Per-user pharmacy profile (extends Better Auth user with till/role data).
CREATE TABLE staff_profile (
  user_id         text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'cashier'
                  CHECK (role IN ('owner','manager','pharmacist','cashier')),
  branch_id       uuid REFERENCES branch(id),
  phone           text,
  pin_hash        text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_profile_org ON staff_profile(organization_id);

-- Platform operators (separate from tenant staff). Operator-only.
CREATE TABLE platform_admin (
  user_id    text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_settings (
  organization_id text PRIMARY KEY REFERENCES "organization"("id") ON DELETE CASCADE,
  settings        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  price_kes  numeric(12,2) NOT NULL DEFAULT 0,
  interval   text NOT NULL DEFAULT 'monthly' CHECK (interval IN ('monthly','annual')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscription (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    text NOT NULL UNIQUE REFERENCES "organization"("id") ON DELETE CASCADE,
  plan_id            uuid REFERENCES plan(id),
  status             text NOT NULL DEFAULT 'trialing'
                     CHECK (status IN ('trialing','active','past_due','suspended','cancelled')),
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  provider           text,
  provider_ref       text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscription_payment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  amount_kes      numeric(12,2) NOT NULL,
  method          text,
  reference       text,
  period_start    date,
  period_end      date,
  recorded_by     text REFERENCES "user"("id"),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sub_payment_org ON subscription_payment(organization_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE branch               ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profile        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin       ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payment ENABLE ROW LEVEL SECURITY;

-- Org-scoped: members of the org (any role) read; managers/owners write.
CREATE POLICY branch_read   ON branch        FOR SELECT USING (organization_id = public.user_organization_id());
CREATE POLICY branch_write  ON branch        FOR ALL    USING (organization_id = public.user_organization_id() AND public.user_role() IN ('owner','manager'))
                                                        WITH CHECK (organization_id = public.user_organization_id() AND public.user_role() IN ('owner','manager'));
CREATE POLICY staff_read    ON staff_profile FOR SELECT USING (organization_id = public.user_organization_id());
CREATE POLICY staff_write   ON staff_profile FOR ALL    USING (organization_id = public.user_organization_id() AND public.user_role() IN ('owner','manager'))
                                                        WITH CHECK (organization_id = public.user_organization_id() AND public.user_role() IN ('owner','manager'));
CREATE POLICY orgset_read   ON org_settings  FOR SELECT USING (organization_id = public.user_organization_id());
CREATE POLICY orgset_write  ON org_settings  FOR ALL    USING (organization_id = public.user_organization_id() AND public.user_role() = 'owner')
                                                        WITH CHECK (organization_id = public.user_organization_id() AND public.user_role() = 'owner');
CREATE POLICY sub_read      ON subscription         FOR SELECT USING (organization_id = public.user_organization_id());
CREATE POLICY subpay_read   ON subscription_payment FOR SELECT USING (organization_id = public.user_organization_id());

-- Plan catalogue is readable by any authenticated user; writes via app_owner only.
CREATE POLICY plan_read ON plan FOR SELECT USING (true);

-- platform_admin & subscription writes: no app_authenticated policy => denied;
-- only app_owner (operator/service via dbAdmin) can touch them.

INSERT INTO plan (code, name, price_kes, interval) VALUES
  ('starter','Starter',2500,'monthly'),
  ('growth','Growth',6000,'monthly'),
  ('enterprise','Enterprise',15000,'monthly')
ON CONFLICT (code) DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS subscription_payment;
DROP TABLE IF EXISTS subscription;
DROP TABLE IF EXISTS plan;
DROP TABLE IF EXISTS org_settings;
DROP TABLE IF EXISTS platform_admin;
DROP TABLE IF EXISTS staff_profile;
DROP TABLE IF EXISTS branch;
