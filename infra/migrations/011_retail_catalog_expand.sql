-- migrate:up
-- Expand the retail catalogue toward ~300 SKUs (depth across existing
-- departments + subcategories). Same convention as 010: prices PER BASE UNIT in
-- KES, UPSERT on (name, strength, dosage_form). New generics/brands only — brand
-- variants of an existing generic carry the brand in the name to keep keys unique.

-- ── OTC MEDICINES ───────────────────────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Paracetamol', NULL, '1000mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 2.00, 5.00),
  ('Mefenamic Acid', 'Ponstan', '500mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 3.00, 8.00),
  ('Naproxen', NULL, '250mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 3.50, 9.00),
  ('Ibuprofen Syrup', NULL, '100mg/5ml', 'Syrup', 'bottle', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Bottle 100ml', 1, 90.00, 180.00),
  ('Muscle Rub', 'Deep Heat', NULL, 'Cream', 'tube', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Tube 35g', 1, 200.00, 380.00),
  ('Cold & Flu Tablets', 'Coldcap', NULL, 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Strip of 10', 10, 5.00, 12.00),
  ('Vapour Rub', 'Vicks VapoRub', NULL, 'Ointment', 'tub', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Tub 50g', 1, 200.00, 380.00),
  ('Throat Lozenges', 'Halls', NULL, 'Lozenge', 'piece', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Pack of 9', 9, 3.00, 8.00),
  ('Saline Nasal Spray', NULL, NULL, 'Spray', 'bottle', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Bottle 30ml', 1, 150.00, 300.00),
  ('Levocetirizine', NULL, '5mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Cough, Cold & Allergy', true, 'Strip of 10', 10, 3.00, 8.00),
  ('Simethicone', NULL, '40mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Digestive Health', true, 'Strip of 10', 10, 3.00, 8.00),
  ('Lactulose Syrup', 'Duphalac', NULL, 'Syrup', 'bottle', false, false, 'OTC Medicines', 'Digestive Health', true, 'Bottle 200ml', 1, 250.00, 450.00),
  ('Antacid Suspension', 'Gaviscon', NULL, 'Suspension', 'bottle', false, false, 'OTC Medicines', 'Digestive Health', true, 'Bottle 200ml', 1, 220.00, 420.00),
  ('Domperidone', 'Motilium', '10mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Digestive Health', true, 'Strip of 10', 10, 3.00, 8.00),
  ('Senna', NULL, '7.5mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Digestive Health', true, 'Strip of 10', 10, 2.00, 6.00),
  ('Glycerin Suppository', NULL, NULL, 'Suppository', 'piece', false, false, 'OTC Medicines', 'Digestive Health', true, 'Pack of 6', 6, 12.00, 30.00),
  ('Chloramphenicol Eye Drops', NULL, '0.5%', 'Drops', 'bottle', false, false, 'OTC Medicines', 'Eye & Ear', true, 'Bottle 10ml', 1, 70.00, 150.00),
  ('Ear Wax Drops', NULL, NULL, 'Drops', 'bottle', false, false, 'OTC Medicines', 'Eye & Ear', true, 'Bottle 10ml', 1, 90.00, 180.00),
  ('Lubricating Eye Drops', NULL, NULL, 'Drops', 'bottle', false, false, 'OTC Medicines', 'Eye & Ear', true, 'Bottle 10ml', 1, 150.00, 320.00),
  ('Miconazole Cream', 'Daktarin', '2%', 'Cream', 'tube', false, false, 'OTC Medicines', 'Antifungal', true, 'Tube 30g', 1, 180.00, 350.00),
  ('Terbinafine Cream', 'Lamisil', '1%', 'Cream', 'tube', false, false, 'OTC Medicines', 'Antifungal', true, 'Tube 15g', 1, 220.00, 420.00),
  ('Cinnarizine', 'Stugeron', '25mg', 'Tablet', 'tablet', false, false, 'OTC Medicines', 'Pain & Fever', true, 'Strip of 10', 10, 3.00, 8.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ── PRESCRIPTION MEDICINES ──────────────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Flucloxacillin', NULL, '250mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 4.00, 10.00),
  ('Ampicillin/Cloxacillin', 'Ampiclox', '500mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 5.00, 12.00),
  ('Amoxicillin/Clavulanic Acid Suspension', 'Augmentin', '228mg/5ml', 'Suspension', 'bottle', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Bottle 100ml', 1, 250.00, 480.00),
  ('Levofloxacin', NULL, '500mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 5', 5, 18.00, 40.00),
  ('Norfloxacin', NULL, '400mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 5.00, 12.00),
  ('Cefixime', NULL, '200mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 15.00, 35.00),
  ('Clarithromycin', 'Klaricid', '500mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 35.00, 70.00),
  ('Tinidazole', NULL, '500mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Strip of 10', 10, 6.00, 14.00),
  ('Metronidazole Suspension', 'Flagyl', '200mg/5ml', 'Suspension', 'bottle', false, true, 'Prescription Medicines', 'Antibiotics', false, 'Bottle 100ml', 1, 70.00, 150.00),
  ('Bisoprolol', NULL, '5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 4.00, 9.00),
  ('Carvedilol', NULL, '12.5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 5.00, 12.00),
  ('Valsartan', 'Diovan', '80mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 12.00, 25.00),
  ('Telmisartan', 'Micardis', '40mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 8.00, 18.00),
  ('Ramipril', NULL, '5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 4.00, 10.00),
  ('Spironolactone', 'Aldactone', '25mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 3.00, 8.00),
  ('Clopidogrel', 'Plavix', '75mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 10.00, 22.00),
  ('Rosuvastatin', 'Crestor', '10mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Cholesterol', false, 'Strip of 10', 10, 12.00, 25.00),
  ('Warfarin', NULL, '5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Heart & Blood Pressure', false, 'Strip of 10', 10, 3.00, 8.00),
  ('Gliclazide', 'Diamicron', '80mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Diabetes', false, 'Strip of 10', 10, 5.00, 12.00),
  ('Sitagliptin', 'Januvia', '50mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Diabetes', false, 'Strip of 10', 10, 35.00, 70.00),
  ('Insulin Mixtard 30/70', 'Mixtard', '100IU/ml', 'Injection', 'vial', false, true, 'Prescription Medicines', 'Diabetes', false, 'Vial 10ml', 1, 450.00, 750.00),
  ('Insulin Glargine', 'Lantus', '100IU/ml', 'Injection', 'vial', false, true, 'Prescription Medicines', 'Diabetes', false, 'Pen/Vial', 1, 1200.00, 1900.00),
  ('Levothyroxine', 'Eltroxin', '50mcg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Thyroid', false, 'Strip of 10', 10, 3.00, 8.00),
  ('Carbimazole', 'Neo-Mercazole', '5mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Thyroid', false, 'Strip of 10', 10, 4.00, 10.00),
  ('Beclomethasone Inhaler', 'Becotide', '250mcg', 'Inhaler', 'inhaler', false, true, 'Prescription Medicines', 'Respiratory', false, 'Inhaler', 1, 350.00, 650.00),
  ('Salmeterol/Fluticasone Inhaler', 'Seretide', '25/125mcg', 'Inhaler', 'inhaler', false, true, 'Prescription Medicines', 'Respiratory', false, 'Inhaler', 1, 1500.00, 2400.00),
  ('Montelukast', 'Singulair', '10mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Respiratory', false, 'Strip of 10', 10, 12.00, 25.00),
  ('Carbamazepine', 'Tegretol', '200mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Neurology', false, 'Strip of 10', 10, 3.00, 8.00),
  ('Sodium Valproate', 'Epilim', '200mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Neurology', false, 'Strip of 10', 10, 4.00, 10.00),
  ('Gabapentin', 'Neurontin', '300mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Neurology', false, 'Strip of 10', 10, 8.00, 18.00),
  ('Fluoxetine', 'Prozac', '20mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Mental Health', false, 'Strip of 10', 10, 5.00, 12.00),
  ('Sertraline', 'Zoloft', '50mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Mental Health', false, 'Strip of 10', 10, 6.00, 14.00),
  ('Allopurinol', 'Zyloric', '100mg', 'Tablet', 'tablet', false, true, 'Prescription Medicines', 'Other Chronic', false, 'Strip of 10', 10, 3.00, 8.00),
  ('Codeine Phosphate', NULL, '30mg', 'Tablet', 'tablet', true, true, 'Prescription Medicines', 'Controlled / CNS', false, 'Strip of 10', 10, 6.00, 15.00),
  ('Pregabalin', 'Lyrica', '75mg', 'Capsule', 'capsule', false, true, 'Prescription Medicines', 'Neurology', false, 'Strip of 10', 10, 12.00, 25.00),
  ('Hyoscine Injection', 'Buscopan', '20mg/ml', 'Injection', 'vial', false, true, 'Prescription Medicines', 'Other Chronic', false, 'Ampoule', 1, 30.00, 70.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ── SUPPLEMENTS & NUTRITION ─────────────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Vitamin B12', NULL, '1000mcg', 'Tablet', 'tablet', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Strip of 10', 10, 3.00, 8.00),
  ('Vitamin E', NULL, '400IU', 'Capsule', 'bottle', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Bottle of 30', 1, 350.00, 600.00),
  ('Vitamin A', NULL, '50000IU', 'Capsule', 'bottle', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Bottle of 30', 1, 200.00, 400.00),
  ('Iron Syrup', 'Ferrous', NULL, 'Syrup', 'bottle', false, false, 'Supplements & Nutrition', 'Minerals', true, 'Bottle 200ml', 1, 120.00, 250.00),
  ('Zinc Syrup', NULL, NULL, 'Syrup', 'bottle', false, false, 'Supplements & Nutrition', 'Minerals', true, 'Bottle 100ml', 1, 100.00, 200.00),
  ('Magnesium', NULL, '250mg', 'Tablet', 'bottle', false, false, 'Supplements & Nutrition', 'Minerals', true, 'Bottle of 60', 1, 450.00, 800.00),
  ('Glucosamine', NULL, '500mg', 'Tablet', 'bottle', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Bottle of 60', 1, 800.00, 1400.00),
  ('Collagen', NULL, NULL, 'Powder', 'tin', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Tin 250g', 1, 1200.00, 2000.00),
  ('Biotin', NULL, '10000mcg', 'Tablet', 'bottle', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Bottle of 30', 1, 600.00, 1100.00),
  ('Evening Primrose Oil', NULL, '1000mg', 'Capsule', 'bottle', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Bottle of 30', 1, 700.00, 1200.00),
  ('Spirulina', NULL, NULL, 'Tablet', 'bottle', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Bottle of 60', 1, 600.00, 1100.00),
  ('Prenatal Multivitamin', 'Pregnacare', NULL, 'Tablet', 'pack', false, false, 'Supplements & Nutrition', 'Supplements', true, 'Pack of 30', 1, 700.00, 1200.00),
  ('Vitamin C Chewable (Kids)', NULL, '100mg', 'Tablet', 'bottle', false, false, 'Supplements & Nutrition', 'Vitamins', true, 'Bottle of 30', 1, 200.00, 400.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ── PERSONAL CARE ───────────────────────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Shower Gel', 'Dove', NULL, NULL, 'bottle', false, false, 'Personal Care', 'Bath & Body', true, 'Bottle 250ml', 1, 350.00, 600.00),
  ('Shampoo', 'Pantene', NULL, NULL, 'bottle', false, false, 'Personal Care', 'Hair Care', true, 'Bottle 200ml', 1, 300.00, 520.00),
  ('Hair Conditioner', 'Pantene', NULL, NULL, 'bottle', false, false, 'Personal Care', 'Hair Care', true, 'Bottle 200ml', 1, 300.00, 520.00),
  ('Hand Wash', 'Dettol', NULL, NULL, 'bottle', false, false, 'Personal Care', 'Hygiene', true, 'Bottle 250ml', 1, 180.00, 320.00),
  ('Wet Wipes', NULL, NULL, NULL, 'pack', false, false, 'Personal Care', 'Hygiene', true, 'Pack of 80', 1, 150.00, 280.00),
  ('Cotton Wool Balls', NULL, NULL, NULL, 'pack', false, false, 'Personal Care', 'Hygiene', true, 'Pack of 100', 1, 60.00, 130.00),
  ('Nail Clippers', NULL, NULL, NULL, 'piece', false, false, 'Personal Care', 'Grooming', true, 'Each', 1, 60.00, 140.00),
  ('Shaving Cream', 'Gillette', NULL, NULL, 'piece', false, false, 'Personal Care', 'Grooming', true, 'Each 200ml', 1, 250.00, 450.00),
  ('Talcum Powder', NULL, NULL, NULL, 'piece', false, false, 'Personal Care', 'Bath & Body', true, 'Each 200g', 1, 150.00, 280.00),
  ('Tampons', 'Tampax', NULL, NULL, 'pack', false, false, 'Personal Care', 'Feminine Hygiene', true, 'Pack of 16', 1, 350.00, 600.00),
  ('Spray Deodorant', 'Rexona', NULL, NULL, 'piece', false, false, 'Personal Care', 'Bath & Body', true, 'Each 150ml', 1, 280.00, 500.00),
  ('Facial Tissue', NULL, NULL, NULL, 'pack', false, false, 'Personal Care', 'Hygiene', true, 'Box', 1, 80.00, 160.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ── MUM & BABY ──────────────────────────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Infant Formula Stage 3', 'NAN', NULL, NULL, 'tin', false, false, 'Mum & Baby', 'Formula & Feeding', true, 'Tin 400g', 1, 950.00, 1450.00),
  ('Baby Cereal', 'Cerelac', NULL, NULL, 'tin', false, false, 'Mum & Baby', 'Formula & Feeding', true, 'Tin 400g', 1, 450.00, 750.00),
  ('Teething Gel', 'Bonjela', NULL, 'Gel', 'tube', false, false, 'Mum & Baby', 'Baby Health', true, 'Tube 15g', 1, 200.00, 400.00),
  ('Baby Oil', 'Johnsons', NULL, NULL, 'bottle', false, false, 'Mum & Baby', 'Baby Skincare', true, 'Bottle 200ml', 1, 250.00, 450.00),
  ('Diaper Rash Cream', 'Sudocrem', NULL, 'Cream', 'tub', false, false, 'Mum & Baby', 'Baby Skincare', true, 'Tub 125g', 1, 450.00, 800.00),
  ('Baby Bottle', NULL, NULL, NULL, 'piece', false, false, 'Mum & Baby', 'Feeding Accessories', true, 'Each 250ml', 1, 250.00, 480.00),
  ('Pacifier', NULL, NULL, NULL, 'piece', false, false, 'Mum & Baby', 'Feeding Accessories', true, 'Each', 1, 150.00, 300.00),
  ('Nursing Breast Pads', NULL, NULL, NULL, 'pack', false, false, 'Mum & Baby', 'Maternity', true, 'Pack of 30', 1, 250.00, 450.00),
  ('Breast Pump (Manual)', NULL, NULL, NULL, 'piece', false, false, 'Mum & Baby', 'Maternity', true, 'Each', 1, 800.00, 1500.00),
  ('ORS + Zinc (Kids)', NULL, NULL, 'Sachet', 'sachet', false, false, 'Mum & Baby', 'Baby Health', true, 'Sachet', 1, 12.00, 30.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ── BEAUTY & SKIN CARE ──────────────────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Niacinamide Serum', 'The Ordinary', '30ml', 'Serum', 'piece', false, false, 'Beauty & Skin Care', 'Serums', true, 'Each 30ml', 1, 900.00, 1500.00),
  ('Hyaluronic Acid Serum', 'The Ordinary', '30ml', 'Serum', 'piece', false, false, 'Beauty & Skin Care', 'Serums', true, 'Each 30ml', 1, 950.00, 1600.00),
  ('Retinol Serum', NULL, '30ml', 'Serum', 'piece', false, false, 'Beauty & Skin Care', 'Serums', true, 'Each 30ml', 1, 1100.00, 1900.00),
  ('Facial Toner', 'Garnier', NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Face Care', true, 'Bottle 200ml', 1, 400.00, 700.00),
  ('Face Wash', 'Cetaphil', NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Face Care', true, 'Bottle 125ml', 1, 1200.00, 1900.00),
  ('Eye Cream', NULL, NULL, 'Cream', 'piece', false, false, 'Beauty & Skin Care', 'Face Care', true, 'Each 15ml', 1, 800.00, 1400.00),
  ('Shea Butter', NULL, NULL, NULL, 'tub', false, false, 'Beauty & Skin Care', 'Skin Treatments', true, 'Tub 250g', 1, 200.00, 400.00),
  ('Cocoa Butter Lotion', 'Vaseline', NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Skin Treatments', true, 'Bottle 400ml', 1, 350.00, 600.00),
  ('Hair Oil', NULL, NULL, NULL, 'bottle', false, false, 'Beauty & Skin Care', 'Hair Care', true, 'Bottle 100ml', 1, 180.00, 350.00),
  ('Lip Gloss', NULL, NULL, NULL, 'piece', false, false, 'Beauty & Skin Care', 'Makeup', true, 'Each', 1, 250.00, 500.00),
  ('Mascara', NULL, NULL, NULL, 'piece', false, false, 'Beauty & Skin Care', 'Makeup', true, 'Each', 1, 350.00, 650.00),
  ('Nail Polish', NULL, NULL, NULL, 'piece', false, false, 'Beauty & Skin Care', 'Makeup', true, 'Each', 1, 150.00, 300.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ── MEDICAL DEVICES & DIAGNOSTICS ───────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Weighing Scale', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Monitoring', true, 'Each', 1, 1200.00, 2200.00),
  ('Walking Stick', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Mobility & Support', true, 'Each', 1, 600.00, 1200.00),
  ('Crutches (Pair)', NULL, NULL, NULL, 'pair', false, false, 'Medical Devices', 'Mobility & Support', true, 'Pair', 1, 1500.00, 2800.00),
  ('Knee Support', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Mobility & Support', true, 'Each', 1, 350.00, 700.00),
  ('Back Support Belt', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Mobility & Support', true, 'Each', 1, 700.00, 1400.00),
  ('Hot Water Bottle', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Wellness', true, 'Each', 1, 350.00, 650.00),
  ('First Aid Kit', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Wellness', true, 'Each', 1, 800.00, 1500.00),
  ('Compression Stockings', NULL, NULL, NULL, 'pair', false, false, 'Medical Devices', 'Mobility & Support', true, 'Pair', 1, 600.00, 1200.00),
  ('Lancets', NULL, NULL, NULL, 'pack', false, false, 'Medical Devices', 'Consumables', true, 'Pack of 100', 1, 400.00, 750.00),
  ('Alcohol Swabs', NULL, NULL, NULL, 'pack', false, false, 'Medical Devices', 'Consumables', true, 'Pack of 100', 1, 120.00, 250.00),
  ('Urinalysis Test Strips', NULL, NULL, 'Strip', 'pack', false, false, 'Medical Devices', 'Diagnostics', true, 'Pack of 100', 1, 800.00, 1400.00),
  ('Malaria Rapid Test', NULL, NULL, 'Kit', 'piece', false, false, 'Medical Devices', 'Diagnostics', true, 'Each', 1, 60.00, 150.00),
  ('COVID-19 Antigen Test', NULL, NULL, 'Kit', 'piece', false, false, 'Medical Devices', 'Diagnostics', true, 'Each', 1, 150.00, 350.00),
  ('Insulin Syringe', NULL, '1ml', 'Syringe', 'piece', false, false, 'Medical Devices', 'Consumables', true, 'Each', 1, 8.00, 20.00),
  ('Nebulizer Mask', NULL, NULL, NULL, 'piece', false, false, 'Medical Devices', 'Respiratory', true, 'Each', 1, 80.00, 180.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ── FAMILY PLANNING & SEXUAL HEALTH ─────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Injectable Contraceptive', 'Depo-Provera', '150mg', 'Injection', 'vial', false, false, 'Family Planning & Sexual Health', 'Contraceptives', true, 'Vial', 1, 120.00, 300.00),
  ('Female Condom', NULL, NULL, 'Unit', 'piece', false, false, 'Family Planning & Sexual Health', 'Condoms', true, 'Each', 1, 25.00, 60.00),
  ('Emergency Contraceptive (P2)', 'P2', NULL, 'Tablet', 'pack', false, false, 'Family Planning & Sexual Health', 'Contraceptives', true, 'Single dose', 1, 70.00, 150.00),
  ('Combined Oral Contraceptive (Femiplan)', 'Femiplan', NULL, 'Tablet', 'pack', false, false, 'Family Planning & Sexual Health', 'Contraceptives', true, 'Cycle of 28', 1, 40.00, 100.00),
  ('Lubricant Sachet', 'KY Jelly', NULL, 'Gel', 'piece', false, false, 'Family Planning & Sexual Health', 'Wellness', true, 'Each 50g', 1, 200.00, 400.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- ── FIRST AID & CONSUMABLES ─────────────────────────────────────────────────
INSERT INTO drug_catalog
  (name, brand_name, strength, dosage_form, base_unit, is_controlled, requires_prescription,
   category, subcategory, is_otc, default_pack_label, default_units_per_pack, default_cost_price, default_selling_price)
VALUES
  ('Antiseptic Cream', 'Savlon', NULL, 'Cream', 'tube', false, false, 'First Aid & Consumables', 'Skin & Wounds', true, 'Tube 30g', 1, 120.00, 240.00),
  ('Burn Gel', NULL, NULL, 'Gel', 'tube', false, false, 'First Aid & Consumables', 'Skin & Wounds', true, 'Tube 25g', 1, 200.00, 400.00),
  ('Micropore Tape', NULL, NULL, 'Roll', 'piece', false, false, 'First Aid & Consumables', 'Dressings', true, 'Roll', 1, 40.00, 90.00),
  ('Gauze Swabs', NULL, NULL, NULL, 'pack', false, false, 'First Aid & Consumables', 'Dressings', true, 'Pack of 100', 1, 150.00, 300.00),
  ('Triangular Bandage', NULL, NULL, NULL, 'piece', false, false, 'First Aid & Consumables', 'Dressings', true, 'Each', 1, 50.00, 120.00),
  ('Normal Saline', NULL, '0.9%', 'Solution', 'bottle', false, false, 'First Aid & Consumables', 'Antiseptics', true, 'Bottle 500ml', 1, 80.00, 160.00),
  ('Wound Cleaning Spray', NULL, NULL, 'Spray', 'bottle', false, false, 'First Aid & Consumables', 'Skin & Wounds', true, 'Bottle 100ml', 1, 180.00, 350.00),
  ('Disposable Face Shield', NULL, NULL, NULL, 'piece', false, false, 'First Aid & Consumables', 'Protective', true, 'Each', 1, 50.00, 120.00),
  ('Eye Pad', NULL, NULL, NULL, 'piece', false, false, 'First Aid & Consumables', 'Dressings', true, 'Each', 1, 20.00, 50.00),
  ('Disposable Apron', NULL, NULL, NULL, 'piece', false, false, 'First Aid & Consumables', 'Protective', true, 'Each', 1, 15.00, 40.00)
ON CONFLICT (name, strength, dosage_form) DO UPDATE SET
  brand_name = EXCLUDED.brand_name, base_unit = EXCLUDED.base_unit, is_otc = EXCLUDED.is_otc,
  category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
  default_pack_label = EXCLUDED.default_pack_label, default_units_per_pack = EXCLUDED.default_units_per_pack,
  default_cost_price = EXCLUDED.default_cost_price, default_selling_price = EXCLUDED.default_selling_price;

-- migrate:down
DELETE FROM drug_catalog WHERE name IN (
  'Mefenamic Acid','Naproxen','Ibuprofen Syrup','Muscle Rub','Cold & Flu Tablets',
  'Vapour Rub','Throat Lozenges','Saline Nasal Spray','Levocetirizine','Simethicone','Lactulose Syrup',
  'Antacid Suspension','Domperidone','Senna','Glycerin Suppository','Chloramphenicol Eye Drops',
  'Ear Wax Drops','Lubricating Eye Drops','Miconazole Cream','Terbinafine Cream','Cinnarizine',
  'Flucloxacillin','Ampicillin/Cloxacillin','Amoxicillin/Clavulanic Acid Suspension','Levofloxacin',
  'Norfloxacin','Cefixime','Clarithromycin','Tinidazole','Metronidazole Suspension','Bisoprolol',
  'Carvedilol','Valsartan','Telmisartan','Ramipril','Spironolactone','Clopidogrel','Rosuvastatin',
  'Warfarin','Gliclazide','Sitagliptin','Insulin Mixtard 30/70','Insulin Glargine','Levothyroxine',
  'Carbimazole','Beclomethasone Inhaler','Salmeterol/Fluticasone Inhaler','Montelukast','Carbamazepine',
  'Sodium Valproate','Gabapentin','Fluoxetine','Sertraline','Allopurinol','Codeine Phosphate','Pregabalin',
  'Hyoscine Injection','Vitamin B12','Vitamin E','Vitamin A','Iron Syrup','Zinc Syrup','Magnesium',
  'Glucosamine','Collagen','Biotin','Evening Primrose Oil','Spirulina','Prenatal Multivitamin',
  'Vitamin C Chewable (Kids)','Shower Gel','Shampoo','Hair Conditioner','Hand Wash','Wet Wipes',
  'Cotton Wool Balls','Nail Clippers','Shaving Cream','Talcum Powder','Tampons','Spray Deodorant',
  'Facial Tissue','Infant Formula Stage 3','Baby Cereal','Teething Gel','Baby Oil','Diaper Rash Cream',
  'Baby Bottle','Pacifier','Nursing Breast Pads','Breast Pump (Manual)','ORS + Zinc (Kids)',
  'Niacinamide Serum','Hyaluronic Acid Serum','Retinol Serum','Facial Toner','Face Wash','Eye Cream',
  'Shea Butter','Cocoa Butter Lotion','Hair Oil','Lip Gloss','Mascara','Nail Polish','Weighing Scale',
  'Walking Stick','Crutches (Pair)','Knee Support','Back Support Belt','Hot Water Bottle','First Aid Kit',
  'Compression Stockings','Lancets','Alcohol Swabs','Urinalysis Test Strips','Malaria Rapid Test',
  'COVID-19 Antigen Test','Insulin Syringe','Nebulizer Mask','Injectable Contraceptive','Female Condom',
  'Emergency Contraceptive (P2)','Combined Oral Contraceptive (Femiplan)',
  'Lubricant Sachet','Antiseptic Cream','Burn Gel','Micropore Tape','Gauze Swabs','Triangular Bandage',
  'Normal Saline','Wound Cleaning Spray','Disposable Face Shield','Eye Pad','Disposable Apron'
);
