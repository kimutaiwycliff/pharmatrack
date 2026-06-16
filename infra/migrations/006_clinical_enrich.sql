-- migrate:up
-- Enrich the clinical / appointments domain to match the application's feature
-- set: reminder scheduling (recipient + send timing), recurring next-dose
-- suggestions, branch + assignee on appointments, and richer patient + Rx data.
-- These columns existed in the original app; the slim 004 schema dropped them.

-- ── customer ────────────────────────────────────────────────────────────────
ALTER TABLE customer RENAME COLUMN reminder_opt_in TO reminders_opt_in;
ALTER TABLE customer
  ADD COLUMN email          text,
  ADD COLUMN date_of_birth  date,
  ADD COLUMN sex            text,
  ADD COLUMN notes          text,
  ADD COLUMN created_by     text REFERENCES "user"("id");

-- ── appointment_service ───────────────────────────────────────────────────────
ALTER TABLE appointment_service ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- ── appointment ───────────────────────────────────────────────────────────────
ALTER TABLE appointment
  ADD COLUMN branch_id             uuid REFERENCES branch(id),
  ADD COLUMN service               text,
  ADD COLUMN service_label         text,
  ADD COLUMN duration_minutes      integer NOT NULL DEFAULT 15,
  ADD COLUMN assigned_to           text REFERENCES "user"("id"),
  ADD COLUMN notes                 text,
  ADD COLUMN parent_appointment_id uuid REFERENCES appointment(id),
  ADD COLUMN next_due_date         date,
  ADD COLUMN created_by            text REFERENCES "user"("id"),
  ADD COLUMN updated_at            timestamptz NOT NULL DEFAULT now();

-- ── appointment_reminder ──────────────────────────────────────────────────────
ALTER TABLE appointment_reminder ADD COLUMN recipient text;

-- ── prescription ──────────────────────────────────────────────────────────────
ALTER TABLE prescription
  ADD COLUMN prescriber_name   text,
  ADD COLUMN prescriber_reg_no text,
  ADD COLUMN diagnosis         text,
  ADD COLUMN notes             text,
  ADD COLUMN created_by        text REFERENCES "user"("id"),
  ADD COLUMN status            text NOT NULL DEFAULT 'active';

-- ── prescription_item ─────────────────────────────────────────────────────────
ALTER TABLE prescription_item
  ALTER COLUMN drug DROP NOT NULL,
  ADD COLUMN product_id   uuid REFERENCES product(id),
  ADD COLUMN drug_name    text,
  ADD COLUMN dose         text,
  ADD COLUMN duration     text,
  ADD COLUMN instructions text;

-- migrate:down
ALTER TABLE prescription_item
  DROP COLUMN instructions, DROP COLUMN duration, DROP COLUMN dose,
  DROP COLUMN drug_name, DROP COLUMN product_id,
  ALTER COLUMN drug SET NOT NULL;
ALTER TABLE prescription
  DROP COLUMN status, DROP COLUMN created_by, DROP COLUMN notes,
  DROP COLUMN diagnosis, DROP COLUMN prescriber_reg_no, DROP COLUMN prescriber_name;
ALTER TABLE appointment_reminder DROP COLUMN recipient;
ALTER TABLE appointment
  DROP COLUMN updated_at, DROP COLUMN created_by, DROP COLUMN next_due_date,
  DROP COLUMN parent_appointment_id, DROP COLUMN notes, DROP COLUMN assigned_to,
  DROP COLUMN duration_minutes, DROP COLUMN service_label, DROP COLUMN service,
  DROP COLUMN branch_id;
ALTER TABLE appointment_service DROP COLUMN is_active;
ALTER TABLE customer
  DROP COLUMN created_by, DROP COLUMN notes, DROP COLUMN sex,
  DROP COLUMN date_of_birth, DROP COLUMN email;
ALTER TABLE customer RENAME COLUMN reminders_opt_in TO reminder_opt_in;
