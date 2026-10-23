-- migrate:up
-- Platform insights (operator console): how each pharmacy uses PharmaTrack.
--
-- user_activity_day: one row per person per pharmacy per Nairobi day —
-- sign-ins, roughly how many 5-minute stretches they were active, and which
-- app (web / desktop / android). Login history didn't exist before this:
-- Better Auth deletes sessions on sign-out, so this starts empty.
--
-- platform_tenant_note: the operator's follow-up log per pharmacy (calls,
-- WhatsApp, notes, a "follow up on" date).
--
-- Both are operator-only: RLS enabled with NO app_authenticated policy, so a
-- tenant session sees nothing (same pattern as trial_grant / platform_admin).

CREATE TABLE user_activity_day (
  user_id          text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id  text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  day              date NOT NULL,                  -- Africa/Nairobi calendar day
  logins           integer NOT NULL DEFAULT 0 CHECK (logins >= 0),
  pings            integer NOT NULL DEFAULT 0 CHECK (pings >= 0), -- ~5-minute active stretches
  sources          text[] NOT NULL DEFAULT '{}',   -- web | desktop | android
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id, day)
);
CREATE INDEX idx_user_activity_org_day ON user_activity_day (organization_id, day);
ALTER TABLE user_activity_day ENABLE ROW LEVEL SECURITY;

CREATE TABLE platform_tenant_note (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  author_id        text REFERENCES "user"(id) ON DELETE SET NULL,
  kind             text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'call', 'whatsapp', 'email', 'visit')),
  body             text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  follow_up_on     date,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_tenant_note_org ON platform_tenant_note (organization_id, created_at DESC);
ALTER TABLE platform_tenant_note ENABLE ROW LEVEL SECURITY;

-- Per-tenant sales trends (insights, digest) scan by organization + time.
CREATE INDEX IF NOT EXISTS idx_sale_org_created ON sale (organization_id, created_at);

-- migrate:down
DROP INDEX IF EXISTS idx_sale_org_created;
DROP TABLE IF EXISTS platform_tenant_note;
DROP TABLE IF EXISTS user_activity_day;
