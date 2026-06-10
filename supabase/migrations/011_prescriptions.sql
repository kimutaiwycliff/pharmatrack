-- ============================================================
-- 011 — Prescriptions, patient clinical profile, drug interactions
-- ============================================================
-- Reuses `customers` as the patient record (adds clinical fields), adds
-- prescriptions + items, and a small reference table for interaction checks
-- (basic Drug Utilization Review).

-- ── Patient clinical fields ──────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sex text;        -- 'male' | 'female'
ALTER TABLE customers ADD COLUMN IF NOT EXISTS allergies text;  -- free text / comma-separated

-- ── Prescriptions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES customers(id),
  prescriber_name   text,
  prescriber_reg_no text,
  diagnosis       text,
  notes           text,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','cancelled')),
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_org ON prescriptions(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions(customer_id);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES products(id),
  drug_name       text NOT NULL,
  dose            text,
  frequency       text,
  duration        text,
  quantity        integer,
  instructions    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rx_items_rx ON prescription_items(prescription_id);

-- ── Drug interactions (reference data) ───────────────────────
CREATE TABLE IF NOT EXISTS drug_interactions (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_a   text NOT NULL,
  drug_b   text NOT NULL,
  severity text NOT NULL DEFAULT 'moderate' CHECK (severity IN ('minor','moderate','severe')),
  note     text
);
INSERT INTO drug_interactions (drug_a, drug_b, severity, note) VALUES
  ('warfarin','aspirin','severe','Markedly increased bleeding risk'),
  ('warfarin','ibuprofen','severe','Increased bleeding risk (NSAID)'),
  ('warfarin','diclofenac','severe','Increased bleeding risk (NSAID)'),
  ('simvastatin','clarithromycin','severe','Myopathy / rhabdomyolysis risk'),
  ('simvastatin','erythromycin','severe','Myopathy / rhabdomyolysis risk'),
  ('tramadol','fluoxetine','severe','Serotonin syndrome risk (SSRI)'),
  ('tramadol','sertraline','severe','Serotonin syndrome risk (SSRI)'),
  ('ciprofloxacin','tizanidine','severe','Excessive sedation / hypotension'),
  ('metformin','alcohol','moderate','Risk of lactic acidosis'),
  ('digoxin','furosemide','moderate','Hypokalaemia raises digoxin toxicity'),
  ('methotrexate','amoxicillin','moderate','Reduced methotrexate clearance'),
  ('enalapril','spironolactone','moderate','Hyperkalaemia risk'),
  ('enalapril','losartan','moderate','Dual RAAS blockade — hyperkalaemia / renal risk')
ON CONFLICT DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.prescriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_interactions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prescriptions_select" ON public.prescriptions
  FOR SELECT USING (organization_id = user_organization_id());
CREATE POLICY "prescriptions_insert" ON public.prescriptions
  FOR INSERT WITH CHECK (organization_id = user_organization_id() AND user_role() IN ('owner','manager','pharmacist'));
CREATE POLICY "prescriptions_update" ON public.prescriptions
  FOR UPDATE USING (organization_id = user_organization_id() AND user_role() IN ('owner','manager','pharmacist'));

CREATE POLICY "rx_items_select" ON public.prescription_items
  FOR SELECT USING (prescription_id IN (SELECT id FROM public.prescriptions WHERE organization_id = user_organization_id()));
CREATE POLICY "rx_items_insert" ON public.prescription_items
  FOR INSERT WITH CHECK (prescription_id IN (SELECT id FROM public.prescriptions WHERE organization_id = user_organization_id()));
CREATE POLICY "rx_items_delete" ON public.prescription_items
  FOR DELETE USING (prescription_id IN (SELECT id FROM public.prescriptions WHERE organization_id = user_organization_id()));

-- Interaction reference data is readable by any signed-in user.
CREATE POLICY "drug_interactions_select" ON public.drug_interactions
  FOR SELECT USING (true);
