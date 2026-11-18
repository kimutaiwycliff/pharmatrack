-- migrate:up
-- ADR-021: the Cashier station add-on is switched on by the operator after
-- the pharmacy pays (not self-serve checkout). The owner requests it from
-- Settings → Add-ons; the operator confirms the payment in the console, which
-- activates it until `paid_until` (an Africa/Nairobi day, inclusive). Past
-- that day it stops counting as active until the next payment is recorded.
ALTER TABLE org_addon DROP CONSTRAINT IF EXISTS org_addon_status_check;
ALTER TABLE org_addon
  ADD CONSTRAINT org_addon_status_check CHECK (status IN ('requested', 'active', 'cancelled')),
  ADD COLUMN paid_until   date,                 -- null = no end (operator comp)
  ADD COLUMN requested_at timestamptz,
  ADD COLUMN requested_by text REFERENCES "user"(id) ON DELETE SET NULL,
  ADD COLUMN request_note text;

-- Add-on payments sit in the same ledger as plan payments; null = the plan.
ALTER TABLE subscription_payment ADD COLUMN addon_code text REFERENCES addon(code);

-- migrate:down
ALTER TABLE subscription_payment DROP COLUMN IF EXISTS addon_code;
UPDATE org_addon SET status = 'cancelled' WHERE status = 'requested';
ALTER TABLE org_addon
  DROP COLUMN IF EXISTS request_note,
  DROP COLUMN IF EXISTS requested_by,
  DROP COLUMN IF EXISTS requested_at,
  DROP COLUMN IF EXISTS paid_until,
  DROP CONSTRAINT IF EXISTS org_addon_status_check;
ALTER TABLE org_addon ADD CONSTRAINT org_addon_status_check CHECK (status IN ('active', 'cancelled'));
