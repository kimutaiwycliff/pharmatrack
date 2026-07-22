-- migrate:up
-- Launch pricing cut (Starter 2,500 -> 1,500; Growth 6,000 -> 4,500) plus a
-- self-serve "I've paid via M-Pesa" claim flow: an owner records a pending
-- payment claim, the platform operator manually verifies and confirms it
-- (existing operator-recorded payments keep working unchanged, defaulting to
-- 'confirmed').

UPDATE plan SET price_kes = 1500 WHERE code = 'starter';
UPDATE plan SET price_kes = 4500 WHERE code = 'growth';

ALTER TABLE subscription_payment
  ADD COLUMN status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  ADD COLUMN claimed_by text REFERENCES "user"("id");

-- Owners may self-insert a PENDING claim for their own org only; they can never
-- insert (or flip) a confirmed/rejected row directly — only app_owner
-- (the platform operator, via the service-role client) can do that.
CREATE POLICY subpay_claim_insert ON subscription_payment
  FOR INSERT
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.user_role() = 'owner'
    AND status = 'pending'
  );

-- migrate:down
DROP POLICY IF EXISTS subpay_claim_insert ON subscription_payment;
ALTER TABLE subscription_payment
  DROP COLUMN IF EXISTS claimed_by,
  DROP COLUMN IF EXISTS status;

UPDATE plan SET price_kes = 2500 WHERE code = 'starter';
UPDATE plan SET price_kes = 6000 WHERE code = 'growth';
