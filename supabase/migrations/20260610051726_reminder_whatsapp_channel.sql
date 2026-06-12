-- ============================================================
-- 012 — Allow WhatsApp as a reminder channel
-- ============================================================
ALTER TABLE appointment_reminders DROP CONSTRAINT IF EXISTS appointment_reminders_channel_check;
ALTER TABLE appointment_reminders ADD CONSTRAINT appointment_reminders_channel_check
  CHECK (channel IN ('sms','email','whatsapp'));
