-- migrate:up
-- When a payment was confirmed (operator confirm/record, or Paystack), so the
-- console and the tenant's billing history can show it; backfilled from
-- created_at for rows that were already confirmed.
ALTER TABLE subscription_payment ADD COLUMN confirmed_at timestamptz;
UPDATE subscription_payment SET confirmed_at = created_at WHERE status = 'confirmed';

-- migrate:down
ALTER TABLE subscription_payment DROP COLUMN confirmed_at;
