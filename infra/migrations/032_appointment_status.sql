-- migrate:up
-- Align appointment.status with what the web and Android apps actually use
-- (scheduled, confirmed, completed, cancelled, no_show). 004 allowed
-- 'missed' instead of 'no_show' and had no 'confirmed', so "Confirm" and
-- "No-show" failed with a check-constraint error (500) in production.
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_status_check;
UPDATE appointment SET status = 'no_show' WHERE status = 'missed';
ALTER TABLE appointment ADD CONSTRAINT appointment_status_check
  CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'));

-- migrate:down
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_status_check;
UPDATE appointment SET status = 'missed' WHERE status = 'no_show';
UPDATE appointment SET status = 'scheduled' WHERE status = 'confirmed';
ALTER TABLE appointment ADD CONSTRAINT appointment_status_check
  CHECK (status IN ('scheduled', 'completed', 'missed', 'cancelled'));
