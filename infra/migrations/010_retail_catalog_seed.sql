-- migrate:up
-- Full retail catalogue for fast tenant onboarding (MyDawa / Goodlife-style
-- departments). UPSERT on (name, strength, dosage_form): re-enriches the 95 KEML
-- drugs from 007 with department + reference pricing, and adds OTC, personal
-- care, mum & baby, supplements, beauty, devices, family planning and
-- consumables. Prices are PER BASE UNIT in KES (cost, selling) — realistic 2025/6
-- Nairobi retail references the tenant tunes against their own suppliers.
--
-- One INSERT per department. ON CONFLICT updates the enrichment columns so this
-- is idempotent and also back-fills the rows seeded by 007.

-- Reusable upsert tail is repeated per statement (plain SQL has no macro).
-- Columns: name, brand_name, strength, dosage_form, base_unit, is_controlled,
--   requires_prescription, category, subcategory, is_otc,
--   default_pack_label, default_units_per_pack, default_cost_price, default_selling_price

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. OTC MEDICINES                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  -- Pain, fever & anti-inflammatory
  ('Paracetamol', 'Panadol', '500mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 1.20, 3.00),
  ('Paracetamol', NULL, '120mg/5ml', 'Syrup', 'bottle', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Bottle 60ml', 1, 55.00, 110.00),
  ('Paracetamol Extra', 'Panadol Extra', '500mg/65mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 3.50, 7.00),
  ('Ibuprofen', 'Brufen', '200mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 1.50, 4.00),
  ('Ibuprofen', 'Brufen', '400mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 2.00, 5.00),
  ('Aspirin', NULL, '75mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 1.00, 2.50),
  ('Aspirin', NULL, '300mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 1.20, 3.00),
  ('Diclofenac', 'Voltaren', '1%', 'Gel', 'tube', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Tube 20g', 1, 180.00, 350.00),
  ('Aceclofenac/Paracetamol', NULL, '100/325mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 5.00, 12.00),
  -- Cough, cold & allergy
  ('Cetirizine', 'Zyrtec', '10mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Strip of 10', 10, 1.50, 5.00),
  ('Loratadine', NULL, '10mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Strip of 10', 10, 2.50, 6.00),
  ('Chlorpheniramine', 'Piriton', '4mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Strip of 10', 10, 1.00, 3.00),
  ('Promethazine', 'Phenergan', '25mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Strip of 10', 10, 2.00, 5.00),
  ('Cough Syrup (Bronchostop)', 'Bronchostop', NULL, 'Syrup', 'bottle', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Bottle 100ml', 1, 120.00, 250.00),
  ('Cough Syrup (Benylin)', 'Benylin', NULL, 'Syrup', 'bottle', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Bottle 100ml', 1, 160.00, 320.00),
  ('Lozenges', 'Strepsils', NULL, 'Lozenge', 'piece', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Pack of 8', 8, 4.00, 10.00),
  ('Nasal Decongestant', 'Otrivin', '0.1%', 'Drops', 'bottle', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Bottle 10ml', 1, 150.00, 300.00),
  -- Antacids, GI & digestion
  ('Omeprazole', NULL, '20mg', 'Capsule', 'capsule', false, false, 'OTC Medicines', 'Digestive Health', true, 'Strip of 10', 10, 2.00, 6.00),
  ('Ranitidine', NULL, '150mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Digestive Health', true, 'Strip of 10', 10, 2.00, 5.00),
  ('Magnesium Trisilicate', NULL, NULL, 'Suspension', 'bottle', false, false, 'OTC Medicines', 'Digestive Health', true, 'Bottle 200ml', 1, 70.00, 150.00),
  ('Antacid', 'Eno', NULL, 'Sachet', 'sachet', false, false, 'OTC Medicines', 'Digestive Health', true, 'Sachet', 1, 8.00, 20.00),
  ('Hyoscine Butylbromide', 'Buscopan', '10mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Digestive Health', true, 'Strip of 10', 10, 4.00, 10.00),
  ('Loperamide', 'Imodium', '2mg', 'Capsule', 'capsule', false, false, 'OTC Medicines', 'Digestive Health', true, 'Strip of 6', 6, 3.00, 8.00),
  ('Bisacodyl', 'Dulcolax', '5mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Digestive Health', true, 'Strip of 10', 10, 3.00, 8.00),
  ('Oral Rehydration Salts', 'ORS', NULL, 'Sachet', 'sachet', false, false, 'OTC Medicines', 'Digestive Health', true, 'Sachet', 1, 8.00, 20.00),
  -- Antifungal / dewormers / self-care meds
  ('Fluconazole', 'Diflucan', '150mg', 'Capsule', 'capsule', false, false, 'OTC Medicines', 'Antifungal', true, 'Single capsule', 1, 25.00, 60.00),
  ('Albendazole', 'Zentel', '400mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Dewormers', true, 'Single tablet', 1, 8.00, 20.00),
  ('Mebendazole', 'Vermox', '100mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Dewormers', true, 'Strip of 6', 6, 5.00, 12.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. PRESCRIPTION MEDICINES                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  -- Antibiotics
  ('Amoxicillin', NULL, '250mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 3.00, 7.00),
  ('Amoxicillin', NULL, '500mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 4.00, 10.00),
  ('Amoxicillin', NULL, '125mg/5ml', 'Suspension', 'bottle', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Bottle 100ml', 1, 60.00, 130.00),
  ('Amoxicillin/Clavulanic Acid', 'Augmentin', '625mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 25.00, 50.00),
  ('Azithromycin', 'Zithromax', '500mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 3', 3, 25.00, 55.00),
  ('Ciprofloxacin', 'Cipro', '500mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 4.00, 10.00),
  ('Metronidazole', 'Flagyl', '200mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 1.00, 3.00),
  ('Metronidazole', 'Flagyl', '400mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Doxycycline', NULL, '100mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 2.00, 5.00),
  ('Cotrimoxazole', 'Septrin', '480mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Cephalexin', NULL, '500mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 6.00, 14.00),
  ('Cefuroxime', 'Zinnat', '250mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 35.00, 70.00),
  ('Erythromycin', NULL, '250mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 3.00, 8.00),
  ('Clindamycin', 'Dalacin C', '300mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 20.00, 45.00),
  ('Ceftriaxone', NULL, '1g', 'Injection', 'vial', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Vial', 1, 80.00, 180.00),
  ('Nitrofurantoin', NULL, '100mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 5.00, 12.00),
  -- Antimalarials
  ('Artemether/Lumefantrine', 'Coartem', '20/120mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antimalarials', false, 'Pack of 24', 24, 12.00, 25.00),
  ('Dihydroartemisinin/Piperaquine', 'P-Alaxin', '40/320mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antimalarials', false, 'Pack of 9', 9, 30.00, 60.00),
  ('Sulfadoxine/Pyrimethamine', 'Fansidar', '500/25mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antimalarials', false, 'Strip of 3', 3, 10.00, 25.00),
  ('Quinine', NULL, '300mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antimalarials', false, 'Strip of 10', 10, 5.00, 12.00),
  -- Cardiovascular / hypertension / diuretics
  ('Amlodipine', NULL, '5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Amlodipine', NULL, '10mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 2.00, 5.00),
  ('Nifedipine', NULL, '20mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 2.00, 5.00),
  ('Losartan', NULL, '50mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 4.00, 9.00),
  ('Enalapril', NULL, '5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Lisinopril', NULL, '10mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 3.00, 7.00),
  ('Atenolol', NULL, '50mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 2.00, 5.00),
  ('Hydrochlorothiazide', NULL, '25mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Furosemide', 'Lasix', '40mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Methyldopa', 'Aldomet', '250mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 4.00, 9.00),
  ('Atorvastatin', 'Lipitor', '20mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Cholesterol', false, 'Strip of 10', 10, 5.00, 12.00),
  ('Simvastatin', NULL, '20mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Cholesterol', false, 'Strip of 10', 10, 4.00, 10.00),
  -- Diabetes
  ('Metformin', 'Glucophage', '500mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Diabetes', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Metformin', 'Glucophage', '850mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Diabetes', false, 'Strip of 10', 10, 2.00, 5.00),
  ('Glibenclamide', 'Daonil', '5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Diabetes', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Glimepiride', 'Amaryl', '2mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Diabetes', false, 'Strip of 10', 10, 4.00, 9.00),
  -- GI / antiemetics (Rx)
  ('Esomeprazole', 'Nexium', '40mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Digestive Health', false, 'Strip of 10', 10, 12.00, 25.00),
  ('Metoclopramide', 'Plasil', '10mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Digestive Health', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Ondansetron', 'Zofran', '4mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Digestive Health', false, 'Strip of 10', 10, 8.00, 18.00),
  -- Respiratory (Rx)
  ('Salbutamol', 'Ventolin', '4mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Respiratory', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Salbutamol', 'Ventolin', '100mcg', 'Inhaler', 'inhaler', false, true, 'Prescription Medicines', 'Respiratory', false, 'Inhaler 200 doses', 1, 280.00, 500.00),
  -- Steroids / antifungals (Rx)
  ('Prednisolone', NULL, '5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Steroids', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Dexamethasone', NULL, '0.5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Steroids', false, 'Strip of 10', 10, 1.50, 4.00),
  ('Ketoconazole', 'Nizoral', '200mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antifungal', false, 'Strip of 10', 10, 8.00, 18.00),
  ('Griseofulvin', NULL, '500mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antifungal', false, 'Strip of 10', 10, 6.00, 14.00),
  -- Topical (Rx)
  ('Betamethasone', 'Betnovate', '0.1%', 'Cream', 'tube', false, true, 'Prescription Medicines', 'Skin Treatments', false, 'Tube 15g', 1, 90.00, 180.00),
  ('Diclofenac', NULL, '50mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Pain & Inflammation', false, 'Strip of 10', 10, 1.50, 4.00),
  -- CNS / controlled
  ('Tramadol', NULL, '50mg', 'Capsule', 'capsule', true, true, 'Prescription Medicines', 'Controlled / CNS', false, 'Strip of 10', 10, 4.00, 10.00),
  ('Diazepam', 'Valium', '5mg', 'Tablet', 'tablet', true, true, 'Prescription Medicines', 'Controlled / CNS', false, 'Strip of 10', 10, 2.00, 5.00),
  ('Phenobarbital', NULL, '30mg', 'Tablet', 'tablet', true, true, 'Prescription Medicines', 'Controlled / CNS', false, 'Strip of 10', 10, 2.00, 5.00),
  ('Amitriptyline', NULL, '25mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Controlled / CNS', false, 'Strip of 10', 10, 2.00, 5.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. SUPPLEMENTS & NUTRITION                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Vitamin C (Ascorbic Acid)', NULL, '500mg', 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Strip of 10', 10, 1.50, 4.00),
  ('Vitamin C Effervescent', 'Redoxon', '1000mg', 'Tablet', 'tube', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Tube of 10', 1, 250.00, 450.00),
  ('Multivitamin', NULL, NULL, 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Strip of 10', 10, 2.00, 5.00),
  ('Vitamin B Complex', NULL, NULL, 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Strip of 10', 10, 1.50, 4.00),
  ('Ferrous Sulphate', NULL, '200mg', 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Minerals', true, 'Strip of 10', 10, 1.00, 3.00),
  ('Folic Acid', NULL, '5mg', 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Minerals', true, 'Strip of 10', 10, 1.00, 3.00),
  ('Ferrous + Folic Acid', NULL, NULL, 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Minerals', true, 'Strip of 10', 10, 1.50, 4.00),
  ('Zinc Sulphate', NULL, '20mg', 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Minerals', true, 'Strip of 10', 10, 1.50, 4.00),
  ('Calcium + Vitamin D3', 'Calcium Sandoz', NULL, 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Minerals', true, 'Strip of 10', 10, 4.00, 9.00),
  ('Cod Liver Oil', 'Seven Seas', NULL, 'Capsule', 'bottle', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Bottle of 60', 1, 500.00, 900.00),
  ('Omega-3 Fish Oil', NULL, '1000mg', 'Capsule', 'bottle', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Bottle of 30', 1, 700.00, 1200.00),
  ('Probiotic', NULL, NULL, 'Capsule', 'bottle', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Bottle of 30', 1, 600.00, 1100.00),
  ('Vitamin D3', NULL, '1000IU', 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Strip of 10', 10, 3.00, 8.00),
  ('Glucose Powder', 'Lucozade', NULL, 'Powder', 'tin', false, false, 'Supplements & Nutrition', 'Energy & Nutrition', true, 'Tin 200g', 1, 180.00, 320.00),
  ('Multivitamin Syrup', NULL, NULL, 'Syrup', 'bottle', false, false, 'Supplements & Nutrition', 'Energy & Nutrition', true, 'Bottle 200ml', 1, 150.00, 300.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. PERSONAL CARE                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Toothpaste', 'Colgate', NULL, NULL, 'piece', false, false, 'Personal Care', 'Oral Care', true, 'Tube 100ml', 1, 130.00, 220.00),
  ('Toothbrush', 'Colgate', NULL, NULL, 'piece', false, false, 'Personal Care', 'Oral Care', true, 'Each', 1, 60.00, 120.00),
  ('Mouthwash', 'Listerine', NULL, NULL, 'bottle', false, false, 'Personal Care', 'Oral Care', true, 'Bottle 250ml', 1, 320.00, 550.00),
  ('Sanitary Pads', 'Always', NULL, NULL, 'pack', false, false, 'Personal Care', 'Feminine Hygiene', true, 'Pack of 8', 1, 90.00, 160.00),
  ('Panty Liners', 'Always', NULL, NULL, 'pack', false, false, 'Personal Care', 'Feminine Hygiene', true, 'Pack of 20', 1, 110.00, 190.00),
  ('Bath Soap', 'Dettol', NULL, NULL, 'piece', false, false, 'Personal Care', 'Bath & Body', true, 'Bar 100g', 1, 80.00, 140.00),
  ('Body Lotion', 'Nivea', NULL, NULL, 'bottle', false, false, 'Personal Care', 'Bath & Body', true, 'Bottle 400ml', 1, 350.00, 600.00),
  ('Petroleum Jelly', 'Vaseline', NULL, NULL, 'tub', false, false, 'Personal Care', 'Bath & Body', true, 'Tub 100ml', 1, 120.00, 220.00),
  ('Roll-on Deodorant', 'Nivea', NULL, NULL, 'piece', false, false, 'Personal Care', 'Bath & Body', true, 'Each 50ml', 1, 220.00, 400.00),
  ('Hand Sanitizer', NULL, NULL, 'Gel', 'bottle', false, false, 'Personal Care', 'Hygiene', true, 'Bottle 100ml', 1, 80.00, 160.00),
  ('Antiseptic Liquid', 'Dettol', NULL, 'Liquid', 'bottle', false, false, 'Personal Care', 'Hygiene', true, 'Bottle 250ml', 1, 200.00, 380.00),
  ('Lip Balm', NULL, NULL, NULL, 'piece', false, false, 'Personal Care', 'Bath & Body', true, 'Each', 1, 120.00, 250.00),
  ('Shaving Razor', 'Gillette', NULL, NULL, 'piece', false, false, 'Personal Care', 'Grooming', true, 'Pack of 5', 1, 150.00, 280.00),
  ('Cotton Buds', NULL, NULL, NULL, 'pack', false, false, 'Personal Care', 'Hygiene', true, 'Pack of 100', 1, 40.00, 90.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. MUM & BABY                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Infant Formula Stage 1', 'NAN', NULL, NULL, 'tin', false, false, 'Mum & Baby', 'Formula & Feeding', true, 'Tin 400g', 1, 950.00, 1450.00),
  ('Infant Formula Stage 2', 'NAN', NULL, NULL, 'tin', false, false, 'Mum & Baby', 'Formula & Feeding', true, 'Tin 400g', 1, 950.00, 1450.00),
  ('Baby Diapers (Medium)', 'Huggies', NULL, NULL, 'pack', false, false, 'Mum & Baby', 'Diapers & Wipes', true, 'Pack of 30', 1, 650.00, 1050.00),
  ('Baby Diapers (Large)', 'Pampers', NULL, NULL, 'pack', false, false, 'Mum & Baby', 'Diapers & Wipes', true, 'Pack of 28', 1, 700.00, 1100.00),
  ('Baby Wipes', 'Huggies', NULL, NULL, 'pack', false, false, 'Mum & Baby', 'Diapers & Wipes', true, 'Pack of 64', 1, 200.00, 380.00),
  ('Gripe Water', 'Woodwards', NULL, 'Liquid', 'bottle', false, false, 'Mum & Baby', 'Baby Health', true, 'Bottle 150ml', 1, 90.00, 180.00),
  ('Baby Colic Drops', 'Bonnisan', NULL, 'Drops', 'bottle', false, false, 'Mum & Baby', 'Baby Health', true, 'Bottle 60ml', 1, 130.00, 250.00),
  ('Baby Jelly', 'Vaseline Baby', NULL, NULL, 'tub', false, false, 'Mum & Baby', 'Baby Skincare', true, 'Tub 100ml', 1, 120.00, 220.00),
  ('Baby Powder', 'Johnsons', NULL, NULL, 'piece', false, false, 'Mum & Baby', 'Baby Skincare', true, 'Each 200g', 1, 220.00, 400.00),
  ('Baby Lotion', 'Johnsons', NULL, NULL, 'bottle', false, false, 'Mum & Baby', 'Baby Skincare', true, 'Bottle 200ml', 1, 280.00, 480.00),
  ('Baby Shampoo', 'Johnsons', NULL, NULL, 'bottle', false, false, 'Mum & Baby', 'Baby Skincare', true, 'Bottle 200ml', 1, 280.00, 480.00),
  ('Nipple Cream', NULL, NULL, 'Cream', 'tube', false, false, 'Mum & Baby', 'Maternity', true, 'Tube 30g', 1, 350.00, 650.00),
  ('Maternity Pads', NULL, NULL, NULL, 'pack', false, false, 'Mum & Baby', 'Maternity', true, 'Pack of 10', 1, 120.00, 220.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. BEAUTY & SKIN CARE                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Foaming Facial Cleanser', 'CeraVe', NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Face Care', true, 'Bottle 236ml', 1, 1300.00, 1900.00),
  ('Moisturising Lotion', 'CeraVe', NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Face Care', true, 'Bottle 236ml', 1, 1500.00, 2200.00),
  ('Vitamin C Serum', 'Garnier', '30ml', 'Serum', 'piece', false, false, 'Beauty & Skin Care', 'Serums', true, 'Each 30ml', 1, 650.00, 1100.00),
  ('Sunscreen SPF50', 'La Roche-Posay', NULL, NULL, 'piece', false, false, 'Beauty & Skin Care', 'Sun Care', true, 'Each 50ml', 1, 1900.00, 2800.00),
  ('Sunscreen SPF30', 'Nivea Sun', NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Sun Care', true, 'Bottle 75ml', 1, 600.00, 1000.00),
  ('Glycerine', NULL, NULL, 'Liquid', 'bottle', false, false, 'Beauty & Skin Care', 'Skin Treatments', true, 'Bottle 100ml', 1, 80.00, 160.00),
  ('Aqueous Cream', NULL, NULL, 'Cream', 'tub', false, false, 'Beauty & Skin Care', 'Skin Treatments', true, 'Tub 500g', 1, 250.00, 450.00),
  ('Calamine Lotion', NULL, NULL, 'Lotion', 'bottle', false, false, 'Beauty & Skin Care', 'Skin Treatments', true, 'Bottle 100ml', 1, 90.00, 180.00),
  ('Acne Gel (Benzoyl Peroxide)', NULL, '5%', 'Gel', 'tube', false, false, 'Beauty & Skin Care', 'Skin Treatments', true, 'Tube 30g', 1, 250.00, 480.00),
  ('Micellar Water', 'Garnier', NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Face Care', true, 'Bottle 400ml', 1, 550.00, 950.00),
  ('Hair Food', NULL, NULL, NULL, 'tub', false, false, 'Beauty & Skin Care', 'Hair Care', true, 'Tub 250ml', 1, 150.00, 300.00),
  ('Anti-Dandruff Shampoo', 'Head & Shoulders', NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Hair Care', true, 'Bottle 200ml', 1, 350.00, 600.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. MEDICAL DEVICES & DIAGNOSTICS                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Blood Pressure Monitor', 'Omron', NULL, NULL, 'piece', false, false, 'Medical Devices', 'Monitoring', true, 'Each', 1, 3500.00, 5500.00),
  ('Glucometer Kit', 'Accu-Chek', NULL, NULL, 'piece', false, false, 'Medical Devices', 'Monitoring', true, 'Each', 1, 2500.00, 3800.00),
  ('Glucose Test Strips', 'Accu-Chek', NULL, 'Strip', 'pack', false, false, 'Medical Devices', 'Monitoring', true, 'Pack of 50', 1, 1500.00, 2400.00),
  ('Digital Thermometer', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Monitoring', true, 'Each', 1, 250.00, 500.00),
  ('Pulse Oximeter', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Monitoring', true, 'Each', 1, 1500.00, 2700.00),
  ('Nebulizer', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Respiratory', true, 'Each', 1, 3500.00, 5500.00),
  ('Examination Gloves', NULL, NULL, 'Pair', 'piece', false, false, 'Medical Devices', 'Consumables', true, 'Box of 100', 100, 8.00, 18.00),
  ('Face Mask (Surgical)', NULL, NULL, 'Unit', 'piece', false, false, 'Medical Devices', 'Consumables', true, 'Box of 50', 50, 4.00, 12.00),
  ('Disposable Syringe', NULL, '5ml', 'Syringe', 'piece', false, false, 'Medical Devices', 'Consumables', true, 'Each', 1, 6.00, 15.00),
  ('Glucose Test Strips (Loose)', NULL, NULL, 'Strip', 'piece', false, false, 'Medical Devices', 'Consumables', true, 'Each', 1, 30.00, 50.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. FAMILY PLANNING & SEXUAL HEALTH                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Combined Oral Contraceptive', 'Microgynon', NULL, 'Tablet', 'pack', false, false, 'Family Planning & Sexual Health', 'Contraceptives', true, 'Cycle of 28', 1, 40.00, 100.00),
  ('Progestogen-only Pill', 'Microlut', NULL, 'Tablet', 'pack', false, false, 'Family Planning & Sexual Health', 'Contraceptives', true, 'Cycle of 28', 1, 40.00, 100.00),
  ('Emergency Contraceptive', 'Postinor-2', NULL, 'Tablet', 'pack', false, false, 'Family Planning & Sexual Health', 'Contraceptives', true, 'Pack of 2', 1, 90.00, 200.00),
  ('Male Condom', 'Trust', NULL, 'Unit', 'piece', false, false, 'Family Planning & Sexual Health', 'Condoms', true, 'Pack of 3', 3, 8.00, 20.00),
  ('Male Condom (Durex)', 'Durex', NULL, 'Unit', 'piece', false, false, 'Family Planning & Sexual Health', 'Condoms', true, 'Pack of 3', 3, 20.00, 50.00),
  ('Personal Lubricant', 'Durex', NULL, 'Gel', 'piece', false, false, 'Family Planning & Sexual Health', 'Wellness', true, 'Each 50ml', 1, 250.00, 450.00),
  ('Pregnancy Test Kit', NULL, NULL, 'Kit', 'piece', false, false, 'Family Planning & Sexual Health', 'Testing', true, 'Each', 1, 25.00, 70.00),
  ('Ovulation Test Kit', NULL, NULL, 'Kit', 'piece', false, false, 'Family Planning & Sexual Health', 'Testing', true, 'Each', 1, 60.00, 150.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 9. FIRST AID & CONSUMABLES                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Surgical Spirit', NULL, NULL, 'Liquid', 'bottle', false, false, 'First Aid & Consumables', 'Antiseptics', true, 'Bottle 100ml', 1, 35.00, 70.00),
  ('Hydrogen Peroxide', NULL, NULL, 'Liquid', 'bottle', false, false, 'First Aid & Consumables', 'Antiseptics', true, 'Bottle 100ml', 1, 40.00, 80.00),
  ('Povidone Iodine', 'Betadine', '10%', 'Solution', 'bottle', false, false, 'First Aid & Consumables', 'Antiseptics', true, 'Bottle 30ml', 1, 80.00, 160.00),
  ('Hydrocortisone', NULL, '1%', 'Cream', 'tube', false, false, 'First Aid & Consumables', 'Skin & Wounds', true, 'Tube 15g', 1, 70.00, 150.00),
  ('Clotrimazole', 'Canesten', '1%', 'Cream', 'tube', false, false, 'First Aid & Consumables', 'Skin & Wounds', true, 'Tube 20g', 1, 90.00, 180.00),
  ('Whitfield Ointment', NULL, NULL, 'Ointment', 'tube', false, false, 'First Aid & Consumables', 'Skin & Wounds', true, 'Tube 25g', 1, 50.00, 110.00),
  ('Gentian Violet', NULL, NULL, 'Paint', 'bottle', false, false, 'First Aid & Consumables', 'Skin & Wounds', true, 'Bottle 25ml', 1, 30.00, 70.00),
  ('Absorbent Cotton Wool', NULL, NULL, 'Roll', 'piece', false, false, 'First Aid & Consumables', 'Dressings', true, 'Roll 100g', 1, 60.00, 130.00),
  ('Elastic Adhesive Bandage', NULL, NULL, 'Roll', 'piece', false, false, 'First Aid & Consumables', 'Dressings', true, 'Roll', 1, 50.00, 120.00),
  ('Gauze Bandage', NULL, NULL, 'Roll', 'piece', false, false, 'First Aid & Consumables', 'Dressings', true, 'Roll', 1, 25.00, 60.00),
  ('Adhesive Plaster', 'Elastoplast', NULL, 'Strip', 'piece', false, false, 'First Aid & Consumables', 'Dressings', true, 'Pack of 10', 10, 4.00, 12.00),
  ('Crepe Bandage', NULL, '10cm', 'Roll', 'piece', false, false, 'First Aid & Consumables', 'Dressings', true, 'Roll', 1, 90.00, 180.00),
  ('Methylated Spirit', NULL, NULL, 'Liquid', 'bottle', false, false, 'First Aid & Consumables', 'Antiseptics', true, 'Bottle 100ml', 1, 35.00, 70.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- migrate:down
-- Strip enrichment from rows that still carry a category (leaves 007 identities intact).
UPDATE drug_catalog SET category = NULL, subcategory = NULL, is_otc = false,
  default_pack_label = NULL, default_units_per_pack = 1,
  default_cost_price = NULL, default_selling_price = NULL
WHERE category IS NOT NULL;
-- Remove rows introduced by this migration (brand/retail items not in the 007 KEML set).
DELETE FROM drug_catalog WHERE name IN (
  'Paracetamol Extra','Aceclofenac/Paracetamol','Lozenges','Nasal Decongestant','Antacid','Cough Syrup (Benylin)',
  'Vitamin C Effervescent','Vitamin D3','Glucose Powder','Multivitamin Syrup','Cod Liver Oil',
  'Omega-3 Fish Oil','Probiotic','Toothpaste','Toothbrush','Mouthwash','Sanitary Pads','Panty Liners',
  'Bath Soap','Body Lotion','Petroleum Jelly','Roll-on Deodorant','Hand Sanitizer','Antiseptic Liquid',
  'Lip Balm','Shaving Razor','Cotton Buds','Infant Formula Stage 1','Infant Formula Stage 2',
  'Baby Diapers (Medium)','Baby Diapers (Large)','Baby Wipes','Gripe Water','Baby Colic Drops',
  'Baby Jelly','Baby Powder','Baby Lotion','Baby Shampoo','Nipple Cream','Maternity Pads',
  'Foaming Facial Cleanser','Moisturising Lotion','Vitamin C Serum','Sunscreen SPF50','Sunscreen SPF30',
  'Glycerine','Aqueous Cream','Calamine Lotion','Acne Gel (Benzoyl Peroxide)','Micellar Water',
  'Hair Food','Anti-Dandruff Shampoo','Blood Pressure Monitor','Glucometer Kit','Glucose Test Strips',
  'Digital Thermometer','Pulse Oximeter','Nebulizer','Glucose Test Strips (Loose)',
  'Combined Oral Contraceptive','Progestogen-only Pill','Emergency Contraceptive','Personal Lubricant',
  'Male Condom (Durex)','Ovulation Test Kit','Povidone Iodine','Gauze Bandage','Crepe Bandage',
  'Methylated Spirit','Cefuroxime'
);
