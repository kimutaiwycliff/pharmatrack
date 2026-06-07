-- ============================================================
-- 006 — Appointments & booking with reminders
-- ============================================================
-- Lets pharmacists book and monitor recurring clinical appointments
-- (e.g. family-planning injections) and queues email/SMS reminders for
-- both the customer and the assigned pharmacist.

-- ── Customers (lightweight registry) ─────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  phone           text,
  email           text,
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(organization_id, phone);

-- ── Appointments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id       uuid NOT NULL REFERENCES branches(id),
  customer_id     uuid NOT NULL REFERENCES customers(id),

  service         text NOT NULL,                 -- e.g. family_planning_depo
  scheduled_at    timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 15,
  assigned_to     uuid REFERENCES profiles(id),  -- pharmacist

  status          text NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  notes           text,

  next_due_date         date,                          -- suggested next dose
  parent_appointment_id uuid REFERENCES appointments(id),

  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_org_time ON appointments(organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);

-- ── Reminder queue (idempotent) ──────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  channel    text NOT NULL CHECK (channel IN ('sms','email')),
  recipient  text NOT NULL CHECK (recipient IN ('customer','pharmacist')),
  send_at    timestamptz NOT NULL,

  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','sent','failed','skipped')),
  sent_at    timestamptz,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON appointment_reminders(status, send_at);
CREATE INDEX IF NOT EXISTS idx_reminders_appointment ON appointment_reminders(appointment_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

-- customers
CREATE POLICY "customers_select" ON public.customers
  FOR SELECT USING (organization_id = user_organization_id());
CREATE POLICY "customers_insert" ON public.customers
  FOR INSERT WITH CHECK (
    organization_id = user_organization_id()
    AND user_role() IN ('owner','manager','pharmacist')
  );
CREATE POLICY "customers_update" ON public.customers
  FOR UPDATE USING (
    organization_id = user_organization_id()
    AND user_role() IN ('owner','manager','pharmacist')
  );

-- appointments
CREATE POLICY "appointments_select" ON public.appointments
  FOR SELECT USING (organization_id = user_organization_id());
CREATE POLICY "appointments_insert" ON public.appointments
  FOR INSERT WITH CHECK (
    organization_id = user_organization_id()
    AND user_role() IN ('owner','manager','pharmacist')
  );
CREATE POLICY "appointments_update" ON public.appointments
  FOR UPDATE USING (
    organization_id = user_organization_id()
    AND user_role() IN ('owner','manager','pharmacist')
  );

-- appointment_reminders (read for the org; writes happen via service role in cron)
CREATE POLICY "reminders_select" ON public.appointment_reminders
  FOR SELECT USING (organization_id = user_organization_id());
