-- migrate:up
-- Appointment reminders without SMS: staff call the client themselves.
--  * appointment.contact_*: the outcome of that reminder call ("called" /
--    "no_answer"), when and by whom — shown on the "Clients to call" list on
--    web and Android. A confirmed booking still uses status = 'confirmed'.
--  * reminder_digest: one row per person per Nairobi day once their morning
--    "clients to call" email has gone out, so the hourly reminder job never
--    sends it twice. Operator-only (RLS on, no tenant policy) — only the cron
--    (dbAdmin) reads or writes it.

ALTER TABLE appointment
  ADD COLUMN contact_outcome text CHECK (contact_outcome IN ('called', 'no_answer')),
  ADD COLUMN contacted_at    timestamptz,
  ADD COLUMN contacted_by    text REFERENCES "user"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE reminder_digest (
  organization_id   text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  user_id           text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  digest_date       date NOT NULL,          -- Africa/Nairobi calendar day
  appointment_count integer NOT NULL DEFAULT 0,
  email_status      text NOT NULL,          -- sent | skipped | failed
  sent_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, digest_date)
);
ALTER TABLE reminder_digest ENABLE ROW LEVEL SECURITY;

-- migrate:down
DROP TABLE IF EXISTS reminder_digest;
ALTER TABLE appointment
  DROP COLUMN IF EXISTS contacted_by,
  DROP COLUMN IF EXISTS contacted_at,
  DROP COLUMN IF EXISTS contact_outcome;
