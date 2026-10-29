-- migrate:up
-- Approved devices only, part 2 (ADR-018 amendment). An approval can be for
-- "just today" or "7 days" (a locum, a borrowed phone). NULL = until removed.
-- When it passes, staff on that device are signed out and can't sign in
-- again until it's re-approved; sales it already made still upload.
ALTER TABLE device ADD COLUMN approved_until timestamptz;
CREATE INDEX idx_device_approved_until ON device (approved_until) WHERE approved_until IS NOT NULL AND revoked_at IS NULL;

-- What the device may be used for, on top of the person's role: everything
-- (as before), the till only, or the back office only.
ALTER TABLE device ADD COLUMN access text NOT NULL DEFAULT 'all' CHECK (access IN ('all', 'selling', 'back_office'));

-- migrate:down
ALTER TABLE device DROP COLUMN IF EXISTS access;
DROP INDEX IF EXISTS idx_device_approved_until;
ALTER TABLE device DROP COLUMN IF EXISTS approved_until;
