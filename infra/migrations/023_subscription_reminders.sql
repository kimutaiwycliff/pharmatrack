-- migrate:up
-- Tracks which renewal-date instance a reminder email has already been sent
-- for, not just whether one was ever sent — storing the actual trial_ends_at/
-- current_period_end value means a renewal (payment, plan change, operator
-- edit) naturally makes these stale and due for a fresh reminder next cycle,
-- with no need to explicitly reset them at every place those columns change.
ALTER TABLE subscription ADD COLUMN reminder_7d_sent_for timestamptz;
ALTER TABLE subscription ADD COLUMN reminder_1d_sent_for timestamptz;

-- migrate:down
ALTER TABLE subscription DROP COLUMN reminder_7d_sent_for;
ALTER TABLE subscription DROP COLUMN reminder_1d_sent_for;
