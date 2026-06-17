-- migrate:up
-- KEML drug catalog seed (~95 common Kenyan pharmacy products): a global,
-- cross-tenant reference list powering the "Load Kenyan drug catalog"
-- onboarding flow. Identity only — pricing/packs/stock stay org-specific.
-- Ported from the original Supabase migration; idempotent via ON CONFLICT.

INSERT INTO drug_catalog
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

-- migrate:down
DELETE FROM drug_catalog;
