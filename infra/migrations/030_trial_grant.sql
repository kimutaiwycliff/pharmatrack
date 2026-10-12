-- migrate:up
-- One free trial per person. Every trial decision (granted or refused) is
-- recorded in trial_grant, keyed by canonical identity signals (email, Google
-- account, PPB registration number) plus soft signals (IP, user agent) that are
-- only surfaced to the operator, never used to block on their own.
--
-- trial_grant deliberately has NO foreign key to organization: purging a tenant
-- (lib/platform/purge.ts) cascades all of its data and frees the owner's email,
-- but the trial history must survive so the same person can't start over.

CREATE TABLE trial_grant (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               text,           -- intentionally NOT a FK (survives purge)
  email_canonical               text NOT NULL,
  email_raw                     text,
  google_account_id             text,
  phone_e164                    text,
  registration_number_canonical text,
  signup_ip                     text,
  user_agent                    text,
  -- 'backfill' = reconstructed from subscriptions that existed before this migration.
  source                        text NOT NULL CHECK (source IN ('signup', 'google', 'operator', 'backfill')),
  trial_days                    integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  granted                       boolean NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trial_grant_email   ON trial_grant (email_canonical);
CREATE INDEX idx_trial_grant_regno   ON trial_grant (registration_number_canonical) WHERE registration_number_canonical IS NOT NULL;
CREATE INDEX idx_trial_grant_google  ON trial_grant (google_account_id) WHERE google_account_id IS NOT NULL;
CREATE INDEX idx_trial_grant_ip      ON trial_grant (signup_ip) WHERE signup_ip IS NOT NULL;
CREATE INDEX idx_trial_grant_org     ON trial_grant (organization_id);

-- Operator-only: RLS enabled with NO app_authenticated policy, so tenant
-- sessions see nothing; only app_owner (dbAdmin) reads/writes it. Same pattern
-- as tenant_deletion (017) / platform_admin.
ALTER TABLE trial_grant ENABLE ROW LEVEL SECURITY;

-- Backfill one row per existing subscription from its owner's identity.
-- Email canonicalisation mirrors apps/web/lib/trials/canonical.ts:
-- lowercase + trim, drop "+tag", googlemail.com → gmail.com, and drop dots in
-- the local part for Gmail.
INSERT INTO trial_grant (
  organization_id, email_canonical, email_raw, google_account_id,
  registration_number_canonical, source, trial_days, granted, created_at
)
SELECT
  o.org_id,
  CASE WHEN o.dom = 'gmail.com' THEN replace(o.loc, '.', '') ELSE o.loc END || '@' || o.dom,
  o.email,
  o.google_id,
  NULLIF(regexp_replace(upper(coalesce(o.regno, '')), '[\s/\-]+', '', 'g'), ''),
  'backfill',
  o.trial_days,
  o.granted,
  o.created_at
FROM (
  SELECT DISTINCT ON (s.organization_id)
    s.organization_id                                              AS org_id,
    u."email"                                                      AS email,
    split_part(split_part(lower(trim(u."email")), '@', 1), '+', 1) AS loc,
    CASE split_part(lower(trim(u."email")), '@', 2)
      WHEN 'googlemail.com' THEN 'gmail.com'
      ELSE split_part(lower(trim(u."email")), '@', 2)
    END                                                            AS dom,
    (SELECT a."accountId" FROM "account" a
       WHERE a."userId" = u."id" AND a."providerId" = 'google' LIMIT 1) AS google_id,
    os.settings ->> 'registration_number'                          AS regno,
    CASE WHEN s.trial_ends_at IS NULL THEN 0
         ELSE GREATEST(0, round(extract(epoch FROM (s.trial_ends_at - s.created_at)) / 86400))::int
    END                                                            AS trial_days,
    (s.trial_ends_at IS NOT NULL)                                  AS granted,
    s.created_at                                                   AS created_at
  FROM subscription s
  JOIN "member" m ON m."organizationId" = s.organization_id AND m."role" = 'owner'
  JOIN "user" u   ON u."id" = m."userId"
  LEFT JOIN org_settings os ON os.organization_id = s.organization_id
  ORDER BY s.organization_id, m."createdAt"
) o;

-- Owner asks the operator for a (new or longer) trial. Org-scoped; cascades
-- with the tenant. Tenants may read and create their own requests; only the
-- operator (app_owner) decides them.
CREATE TABLE trial_extension_request (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  user_id         text REFERENCES "user"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  message         text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  days_granted    integer CHECK (days_granted IS NULL OR days_granted > 0),
  decided_by      text REFERENCES "user"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trial_ext_org ON trial_extension_request (organization_id, created_at DESC);
-- At most one pending request per tenant.
CREATE UNIQUE INDEX trial_ext_one_pending ON trial_extension_request (organization_id) WHERE status = 'pending';

ALTER TABLE trial_extension_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY trial_ext_select ON trial_extension_request
  FOR SELECT
  USING (organization_id = public.user_organization_id());
CREATE POLICY trial_ext_insert ON trial_extension_request
  FOR INSERT
  WITH CHECK (organization_id = public.user_organization_id() AND status = 'pending');

-- migrate:down
DROP TABLE IF EXISTS trial_extension_request;
DROP TABLE IF EXISTS trial_grant;
