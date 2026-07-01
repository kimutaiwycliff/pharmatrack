-- migrate:up
-- Per-tenant M-Pesa Daraja credentials. Secrets (consumer_secret, passkey) are
-- stored ENCRYPTED by the app (aes-256-gcm) — never plaintext. STK push uses the
-- calling tenant's own creds so payments land in their own till.
CREATE TABLE IF NOT EXISTS mpesa_config (
  organization_id      text PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  environment          text NOT NULL DEFAULT 'sandbox',   -- sandbox | production
  shortcode            text,
  shortcode_type       text NOT NULL DEFAULT 'buygoods',  -- buygoods | paybill
  consumer_key         text,
  consumer_secret_enc  text,
  passkey_enc          text,
  active               boolean NOT NULL DEFAULT false,
  verified_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS safety net (routes use the privileged client with explicit org filters, but
-- enforce tenant isolation for any app_authenticated access too).
ALTER TABLE mpesa_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mpesa_config_rls ON mpesa_config;
CREATE POLICY mpesa_config_rls ON mpesa_config FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- migrate:down
DROP TABLE IF EXISTS mpesa_config;
