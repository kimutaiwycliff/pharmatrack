-- ============================================================
-- 008 — Customer messaging opt-in
-- ============================================================
-- SMS reminders cost money, so each customer can opt in or out. When opted
-- out, no reminders are queued or sent for them.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS reminders_opt_in boolean NOT NULL DEFAULT true;
