-- migrate:up
-- Approved devices only (ADR-018). An optional per-pharmacy lock: staff can
-- sign in only on devices the owner (or a manager) approved. The setting
-- itself lives in org_settings.settings.device_lock (jsonb, off by default).

-- What an approved device is for: a selling till (holds a stock share, syncs
-- offline sales) or a back-office computer (sign-in only).
ALTER TABLE device ADD COLUMN purpose text NOT NULL DEFAULT 'till' CHECK (purpose IN ('till', 'office'));

-- The device a session was signed in on, so revoking a device can end its
-- sessions. Better Auth's table keeps its camelCase column names.
ALTER TABLE "session" ADD COLUMN "deviceId" uuid;
CREATE INDEX idx_session_device ON "session" ("deviceId") WHERE "deviceId" IS NOT NULL;

-- A blocked sign-in asks for approval. The requesting device holds a random
-- secret; only its sha256 is stored, and on approval that same hash becomes
-- the device's token_hash — the key never has to be stored or sent again.
-- `code` is the 6-digit number both screens show so the approver can check
-- they're approving the right device.
CREATE TABLE device_request (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  user_id          text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,  -- who is asking
  branch_id        uuid REFERENCES branch(id) ON DELETE SET NULL,          -- their home branch, as the default
  suggested_name   text NOT NULL,
  platform         text,                                                   -- web | desktop | android
  user_agent       text,
  ip_address       text,
  code             text NOT NULL CHECK (code ~ '^[0-9]{6}$'),
  secret_hash      text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  device_id        uuid REFERENCES device(id) ON DELETE SET NULL,
  decided_by       text REFERENCES "user"(id) ON DELETE SET NULL,
  decided_via      text CHECK (decided_via IN ('pin', 'remote')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  decided_at       timestamptz
);
CREATE INDEX idx_device_request_org_pending ON device_request (organization_id, created_at DESC) WHERE status = 'pending';
ALTER TABLE device_request ENABLE ROW LEVEL SECURITY;
-- Owners/managers see and decide their own pharmacy's requests (the API also
-- checks devices.manage). Creating requests and the requester's polling run
-- as app_owner before any session exists.
CREATE POLICY device_request_rls ON device_request FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- migrate:down
DROP TABLE IF EXISTS device_request;
DROP INDEX IF EXISTS idx_session_device;
ALTER TABLE "session" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE device DROP COLUMN IF EXISTS purpose;
