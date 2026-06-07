-- ============================================================
-- 010 — SaaS: plans, subscriptions, platform admins
-- ============================================================
-- Adds the platform/operator layer above tenants (organizations):
-- a plan catalogue, one subscription per tenant (manual billing now,
-- provider fields ready for later), a manual payment ledger, and a
-- platform-admin identity used to guard the operator console.

-- ── Plans ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  price_kes  numeric(12,2) NOT NULL DEFAULT 0,
  interval   text NOT NULL DEFAULT 'monthly' CHECK (interval IN ('monthly','annual')),
  limits     jsonb NOT NULL DEFAULT '{}',
  features   jsonb NOT NULL DEFAULT '{}',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO plans (code, name, price_kes, interval)
VALUES ('standard', 'Standard', 2500, 'monthly')
ON CONFLICT (code) DO NOTHING;

-- ── Subscriptions (one current per tenant) ───────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id         uuid REFERENCES plans(id),
  status          text NOT NULL DEFAULT 'trialing'
                  CHECK (status IN ('trialing','active','past_due','suspended','cancelled')),
  trial_ends_at        timestamptz,
  current_period_end   timestamptz,
  provider                 text,
  provider_customer_id     text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Manual payment ledger (automation-ready) ─────────────────
CREATE TABLE IF NOT EXISTS subscription_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_kes      numeric(12,2) NOT NULL,
  method          text,
  period_start    date,
  period_end      date,
  reference       text,
  recorded_by     uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_payments_org ON subscription_payments(organization_id);

-- ── Platform admins (SaaS operators) ─────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'kimutaiwycliff90@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- ── Helper functions ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.org_access_allowed(org uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.organization_id = org AND s.status IN ('trialing','active')
  )
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ── Backfill: every existing tenant gets an active subscription ──
INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
SELECT o.id, (SELECT id FROM plans WHERE code = 'standard'), 'active', now() + interval '30 days'
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id = o.id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.plans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins        ENABLE ROW LEVEL SECURITY;

-- Plans: any authenticated user may read the catalogue. Writes via service role.
CREATE POLICY "plans_select" ON public.plans FOR SELECT USING (true);

-- Subscriptions/payments: a tenant can read its own; platform writes use service role.
CREATE POLICY "subscriptions_select" ON public.subscriptions
  FOR SELECT USING (organization_id = user_organization_id());
CREATE POLICY "sub_payments_select" ON public.subscription_payments
  FOR SELECT USING (organization_id = user_organization_id());

-- platform_admins: no client policies (only service role / SECURITY DEFINER reads it).
