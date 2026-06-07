-- ============================================================
-- 009 — Tenant-managed appointment services
-- ============================================================
-- Moves the hardcoded service list into a per-org table owners can edit.
-- appointments.service keeps the slug; service_label is denormalised for
-- display so cards/cron need no lookup.

CREATE TABLE IF NOT EXISTS appointment_services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  label           text NOT NULL,
  recurrence_weeks integer,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_appointment_services_org ON appointment_services(organization_id);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_label text;

-- Seed each org with the previous built-in defaults.
INSERT INTO appointment_services (organization_id, slug, label, recurrence_weeks, sort_order)
SELECT o.id, d.slug, d.label, d.recurrence_weeks, d.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('family_planning_depo',       'Family Planning — Depo-Provera',        13,   0),
  ('family_planning_sayana',     'Family Planning — Sayana Press',        13,   1),
  ('family_planning_noristerat', 'Family Planning — Noristerat (NET-EN)', 8,    2),
  ('family_planning_implant',    'Family Planning — Implant review',      NULL, 3),
  ('vaccination',                'Vaccination / Immunization',            NULL, 4),
  ('injection',                  'Injection (other)',                     NULL, 5),
  ('wound_care',                 'Wound care / Dressing',                 NULL, 6),
  ('bp_check',                   'Blood pressure / Sugar check',          NULL, 7),
  ('consultation',               'Consultation',                          NULL, 8),
  ('other',                      'Other',                                 NULL, 9)
) AS d(slug, label, recurrence_weeks, sort_order)
ON CONFLICT (organization_id, slug) DO NOTHING;

-- Backfill labels on any existing appointments.
UPDATE appointments a
SET service_label = s.label
FROM appointment_services s
WHERE s.organization_id = a.organization_id AND s.slug = a.service AND a.service_label IS NULL;

-- RLS
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appt_services_select" ON public.appointment_services
  FOR SELECT USING (organization_id = user_organization_id());
CREATE POLICY "appt_services_insert" ON public.appointment_services
  FOR INSERT WITH CHECK (organization_id = user_organization_id() AND user_role() IN ('owner','manager'));
CREATE POLICY "appt_services_update" ON public.appointment_services
  FOR UPDATE USING (organization_id = user_organization_id() AND user_role() IN ('owner','manager'));
CREATE POLICY "appt_services_delete" ON public.appointment_services
  FOR DELETE USING (organization_id = user_organization_id() AND user_role() IN ('owner','manager'));
