-- ============================================================
-- DRUG CATALOG (shared reference data)
-- ============================================================
-- A global, cross-tenant list of common products sold in Kenyan
-- pharmacies. Onboarding becomes "search → pick → set qty + price"
-- instead of typing every field for every SKU. It carries identity
-- only (name/strength/form/unit/regulatory flags) — pricing, packs and
-- stock stay org-specific and are set when a product is created from it.

CREATE TABLE IF NOT EXISTS public.drug_catalog (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  brand_name            text,
  manufacturer          text,
  gtin                  text,
  strength              text,
  dosage_form           text,
  base_unit             text NOT NULL DEFAULT 'tablet',
  pack_label            text,
  units_per_pack        integer NOT NULL DEFAULT 1,
  is_controlled         boolean NOT NULL DEFAULT false,
  requires_prescription boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- Treat NULL strength/form as equal so the same molecule isn't seeded twice.
  CONSTRAINT uq_drug_catalog_identity UNIQUE NULLS NOT DISTINCT (name, strength, dosage_form)
);

CREATE INDEX IF NOT EXISTS idx_drug_catalog_name_trgm
  ON public.drug_catalog USING gin (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_drug_catalog_gtin
  ON public.drug_catalog (gtin) WHERE gtin IS NOT NULL;

ALTER TABLE public.drug_catalog ENABLE ROW LEVEL SECURITY;

-- Reference data: any signed-in user may read it. Writes are service-role
-- only (curated centrally), so there is no insert/update/delete policy.
DROP POLICY IF EXISTS "drug_catalog_select" ON public.drug_catalog;
CREATE POLICY "drug_catalog_select" ON public.drug_catalog
  FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------
-- Seed: common Kenyan pharmacy products
-- ------------------------------------------------------------
INSERT INTO public.drug_catalog
  (name, strength, dosage_form, base_unit, is_controlled, requires_prescription)
VALUES
  -- Analgesics / antipyretics / NSAIDs
  ('Paracetamol', '500mg', 'Tablet', 'tablet', false, false),
  ('Paracetamol', '120mg/5ml', 'Syrup', 'bottle', false, false),
  ('Ibuprofen', '200mg', 'Tablet', 'tablet', false, false),
  ('Ibuprofen', '400mg', 'Tablet', 'tablet', false, false),
  ('Diclofenac', '50mg', 'Tablet', 'tablet', false, true),
  ('Aspirin', '75mg', 'Tablet', 'tablet', false, false),
  ('Aspirin', '300mg', 'Tablet', 'tablet', false, false),
  ('Tramadol', '50mg', 'Capsule', 'capsule', true, true),
  ('Diclofenac', '1%', 'Gel', 'tube', false, false),
  -- Antibiotics
  ('Amoxicillin', '250mg', 'Capsule', 'capsule', false, true),
  ('Amoxicillin', '500mg', 'Capsule', 'capsule', false, true),
  ('Amoxicillin', '125mg/5ml', 'Suspension', 'bottle', false, true),
  ('Amoxicillin/Clavulanic Acid', '625mg', 'Tablet', 'tablet', false, true),
  ('Azithromycin', '500mg', 'Tablet', 'tablet', false, true),
  ('Ciprofloxacin', '500mg', 'Tablet', 'tablet', false, true),
  ('Metronidazole', '200mg', 'Tablet', 'tablet', false, true),
  ('Metronidazole', '400mg', 'Tablet', 'tablet', false, true),
  ('Doxycycline', '100mg', 'Capsule', 'capsule', false, true),
  ('Cotrimoxazole', '480mg', 'Tablet', 'tablet', false, true),
  ('Cephalexin', '500mg', 'Capsule', 'capsule', false, true),
  ('Erythromycin', '250mg', 'Tablet', 'tablet', false, true),
  ('Clindamycin', '300mg', 'Capsule', 'capsule', false, true),
  ('Ceftriaxone', '1g', 'Injection', 'vial', false, true),
  ('Nitrofurantoin', '100mg', 'Tablet', 'tablet', false, true),
  -- Antimalarials
  ('Artemether/Lumefantrine', '20/120mg', 'Tablet', 'tablet', false, true),
  ('Dihydroartemisinin/Piperaquine', '40/320mg', 'Tablet', 'tablet', false, true),
  ('Sulfadoxine/Pyrimethamine', '500/25mg', 'Tablet', 'tablet', false, true),
  ('Quinine', '300mg', 'Tablet', 'tablet', false, true),
  -- Antihypertensives / cardiac / diuretics
  ('Amlodipine', '5mg', 'Tablet', 'tablet', false, true),
  ('Amlodipine', '10mg', 'Tablet', 'tablet', false, true),
  ('Nifedipine', '20mg', 'Tablet', 'tablet', false, true),
  ('Losartan', '50mg', 'Tablet', 'tablet', false, true),
  ('Enalapril', '5mg', 'Tablet', 'tablet', false, true),
  ('Lisinopril', '10mg', 'Tablet', 'tablet', false, true),
  ('Atenolol', '50mg', 'Tablet', 'tablet', false, true),
  ('Hydrochlorothiazide', '25mg', 'Tablet', 'tablet', false, true),
  ('Furosemide', '40mg', 'Tablet', 'tablet', false, true),
  ('Methyldopa', '250mg', 'Tablet', 'tablet', false, true),
  ('Atorvastatin', '20mg', 'Tablet', 'tablet', false, true),
  ('Simvastatin', '20mg', 'Tablet', 'tablet', false, true),
  -- Antidiabetics
  ('Metformin', '500mg', 'Tablet', 'tablet', false, true),
  ('Metformin', '850mg', 'Tablet', 'tablet', false, true),
  ('Glibenclamide', '5mg', 'Tablet', 'tablet', false, true),
  ('Glimepiride', '2mg', 'Tablet', 'tablet', false, true),
  -- GI / antacids / PPIs
  ('Omeprazole', '20mg', 'Capsule', 'capsule', false, false),
  ('Esomeprazole', '40mg', 'Tablet', 'tablet', false, true),
  ('Ranitidine', '150mg', 'Tablet', 'tablet', false, false),
  ('Magnesium Trisilicate', NULL, 'Suspension', 'bottle', false, false),
  ('Hyoscine Butylbromide', '10mg', 'Tablet', 'tablet', false, false),
  ('Loperamide', '2mg', 'Capsule', 'capsule', false, false),
  ('Metoclopramide', '10mg', 'Tablet', 'tablet', false, true),
  ('Ondansetron', '4mg', 'Tablet', 'tablet', false, true),
  ('Bisacodyl', '5mg', 'Tablet', 'tablet', false, false),
  ('Oral Rehydration Salts', NULL, 'Sachet', 'sachet', false, false),
  -- Antihistamines / respiratory
  ('Cetirizine', '10mg', 'Tablet', 'tablet', false, false),
  ('Loratadine', '10mg', 'Tablet', 'tablet', false, false),
  ('Chlorpheniramine', '4mg', 'Tablet', 'tablet', false, false),
  ('Promethazine', '25mg', 'Tablet', 'tablet', false, false),
  ('Salbutamol', '4mg', 'Tablet', 'tablet', false, true),
  ('Salbutamol', '100mcg', 'Inhaler', 'inhaler', false, true),
  ('Cough Syrup (Bronchostop)', NULL, 'Syrup', 'bottle', false, false),
  -- Steroids / antifungals
  ('Prednisolone', '5mg', 'Tablet', 'tablet', false, true),
  ('Dexamethasone', '0.5mg', 'Tablet', 'tablet', false, true),
  ('Fluconazole', '150mg', 'Capsule', 'capsule', false, false),
  ('Ketoconazole', '200mg', 'Tablet', 'tablet', false, true),
  ('Griseofulvin', '500mg', 'Tablet', 'tablet', false, true),
  -- Topicals
  ('Hydrocortisone', '1%', 'Cream', 'tube', false, false),
  ('Clotrimazole', '1%', 'Cream', 'tube', false, false),
  ('Betamethasone', '0.1%', 'Cream', 'tube', false, true),
  ('Whitfield Ointment', NULL, 'Ointment', 'tube', false, false),
  ('Gentian Violet', NULL, 'Paint', 'bottle', false, false),
  -- Dewormers
  ('Albendazole', '400mg', 'Tablet', 'tablet', false, false),
  ('Mebendazole', '100mg', 'Tablet', 'tablet', false, false),
  -- Vitamins / supplements
  ('Vitamin C (Ascorbic Acid)', '500mg', 'Tablet', 'tablet', false, false),
  ('Multivitamin', NULL, 'Tablet', 'tablet', false, false),
  ('Ferrous Sulphate', '200mg', 'Tablet', 'tablet', false, false),
  ('Folic Acid', '5mg', 'Tablet', 'tablet', false, false),
  ('Ferrous + Folic Acid', NULL, 'Tablet', 'tablet', false, false),
  ('Zinc Sulphate', '20mg', 'Tablet', 'tablet', false, false),
  ('Calcium + Vitamin D3', NULL, 'Tablet', 'tablet', false, false),
  ('Vitamin B Complex', NULL, 'Tablet', 'tablet', false, false),
  -- Controlled / CNS
  ('Diazepam', '5mg', 'Tablet', 'tablet', true, true),
  ('Phenobarbital', '30mg', 'Tablet', 'tablet', true, true),
  ('Amitriptyline', '25mg', 'Tablet', 'tablet', false, true),
  -- Common consumables / non-drug essentials
  ('Surgical Spirit', NULL, 'Liquid', 'bottle', false, false),
  ('Hydrogen Peroxide', NULL, 'Liquid', 'bottle', false, false),
  ('Absorbent Cotton Wool', NULL, 'Roll', 'piece', false, false),
  ('Elastic Adhesive Bandage', NULL, 'Roll', 'piece', false, false),
  ('Disposable Syringe', '5ml', 'Syringe', 'piece', false, false),
  ('Examination Gloves', NULL, 'Pair', 'piece', false, false),
  ('Adhesive Plaster', NULL, 'Strip', 'piece', false, false),
  ('Male Condom', NULL, 'Unit', 'piece', false, false),
  ('Pregnancy Test Kit', NULL, 'Kit', 'piece', false, false),
  ('Glucose Test Strips', NULL, 'Strip', 'piece', false, false),
  ('Face Mask (Surgical)', NULL, 'Unit', 'piece', false, false)
ON CONFLICT (name, strength, dosage_form) DO NOTHING;
