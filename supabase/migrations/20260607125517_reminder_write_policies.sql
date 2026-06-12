-- ============================================================
-- 007 — Allow staff to create/clear appointment reminders
-- ============================================================
-- Reminder rows are generated at booking time (and cleared/rebuilt on
-- reschedule) by the app using the caller's session, so the org's write
-- roles need INSERT/DELETE on appointment_reminders. The cron updates them
-- with the service role (bypasses RLS).

CREATE POLICY "reminders_insert" ON public.appointment_reminders
  FOR INSERT WITH CHECK (
    organization_id = user_organization_id()
    AND user_role() IN ('owner','manager','pharmacist')
  );

CREATE POLICY "reminders_delete" ON public.appointment_reminders
  FOR DELETE USING (
    organization_id = user_organization_id()
    AND user_role() IN ('owner','manager','pharmacist')
  );
