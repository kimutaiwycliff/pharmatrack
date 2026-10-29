-- migrate:up
-- The notification bell's alerts are worked out live from the pharmacy's
-- state (low stock, expiring batches…), so they can't be "deleted". This
-- remembers, per person, which version of each alert they've already seen or
-- dismissed. `key` names the alert ("low:<product id>"); a fingerprint names
-- its current version ("out", "2026-11-30|30"…), so an alert that changes
-- (stock runs out, a new device asks) shows as new again.
CREATE TABLE notification_state (
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  user_id          text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  key              text NOT NULL,
  seen_fp          text,                 -- the version they last saw
  dismissed_fp     text,                 -- hidden while the alert is still this version
  dismissed_until  timestamptz,          -- snoozed: hidden until then, whatever the version
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idx_notification_state_org_user ON notification_state (organization_id, user_id);

ALTER TABLE notification_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_state_rls ON notification_state FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- migrate:down
DROP TABLE IF EXISTS notification_state;
