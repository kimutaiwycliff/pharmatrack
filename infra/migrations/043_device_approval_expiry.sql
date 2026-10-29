-- migrate:up
-- Approved devices only, part 2 (ADR-018 amendment): an approval can be for
-- "just today" or "7 days" (a locum, a borrowed phone). NULL = until removed.
-- When it passes, staff on that device are signed out and can't sign in
-- again until it's re-approved; sales it already made still upload.
ALTER TABLE device ADD COLUMN approved_until timestamptz;
CREATE INDEX idx_device_approved_until ON device (approved_until) WHERE approved_until IS NOT NULL AND revoked_at IS NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_device_approved_until;
ALTER TABLE device DROP COLUMN IF EXISTS approved_until;
