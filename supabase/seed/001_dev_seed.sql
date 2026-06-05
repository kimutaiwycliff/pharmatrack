-- PharmaTrack Development Seed Data — Realistic Kenyan Pharmacy Catalogue
-- Run AFTER 001_initial_schema.sql and 002_rls.sql
--
-- This seed mirrors the real product mix, brands, manufacturers and KES
-- pricing stocked by Kenyan pharmacies (Goodlife, PharmaPlus, MyDawa, MEDS).
-- It is pitch-ready: ~85 products across 14 categories, with batches that
-- intentionally include healthy stock, low stock, out-of-stock, near-expiry
-- and expired cases so the dashboard alerts have something to show.
--
-- Idempotent: catalogue tables are cleared and re-inserted on every run.
-- Org / branches / profiles / auth users are NOT touched here (see run-seed.ts).
--
-- Notes on the data model:
--   * selling_price / cost_price are PER base_unit (per tablet, per ml, per
--     bottle, per device, etc.) in KES.
--   * Loose dispensed items (tablets/capsules) use units_per_pack = pack size.
--   * Pre-packed items (syrups, creams, devices) use base_unit = the package
--     and units_per_pack = 1.
--   * gtin uses the Kenya GS1 company prefix (616) for a realistic scan demo.

-- ============================================================
-- ORGANIZATION + BRANCHES (kept stable for auth/profile FKs)
-- ============================================================

INSERT INTO organizations (id, name, registration_number, phone, email, address, settings)
VALUES (
  'a1b2c3d4-0001-0001-0001-000000000001',
  'Nairobi Pharmacy',
  'PPB/2014/0042',
  '+254 712 345 678',
  'info@nairobipharmacy.co.ke',
  'Kimathi Street, Nairobi CBD',
  '{"currency":"KES","tax_rate":0.16,"receipt_footer":"Thank you for your business. Get well soon!","tax_enabled":false}'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, organization_id, name, address, phone, is_active)
VALUES
  ('b1b2c3d4-0002-0002-0002-000000000001','a1b2c3d4-0001-0001-0001-000000000001','CBD Branch','Kimathi Street, Nairobi CBD','+254 712 345 678',true),
  ('b1b2c3d4-0002-0002-0002-000000000002','a1b2c3d4-0001-0001-0001-000000000001','Westlands Branch','Westlands Road, Nairobi','+254 723 456 789',true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CLEAR EXISTING CATALOGUE (safe: no sales/cs_log reference these yet)
-- ============================================================

DELETE FROM product_batches
 WHERE product_id IN (SELECT id FROM products WHERE organization_id = 'a1b2c3d4-0001-0001-0001-000000000001');
DELETE FROM products  WHERE organization_id = 'a1b2c3d4-0001-0001-0001-000000000001';
DELETE FROM suppliers WHERE organization_id = 'a1b2c3d4-0001-0001-0001-000000000001';
DELETE FROM categories WHERE organization_id = 'a1b2c3d4-0001-0001-0001-000000000001';

-- ============================================================
-- CATEGORIES
-- ============================================================

INSERT INTO categories (id, organization_id, name)
VALUES
  ('c1000000-0000-0000-0000-000000000001','a1b2c3d4-0001-0001-0001-000000000001','Antibiotics'),
  ('c1000000-0000-0000-0000-000000000002','a1b2c3d4-0001-0001-0001-000000000001','Antimalarials'),
  ('c1000000-0000-0000-0000-000000000003','a1b2c3d4-0001-0001-0001-000000000001','Pain & Fever'),
  ('c1000000-0000-0000-0000-000000000004','a1b2c3d4-0001-0001-0001-000000000001','Cough, Cold & Allergy'),
  ('c1000000-0000-0000-0000-000000000005','a1b2c3d4-0001-0001-0001-000000000001','Gastrointestinal'),
  ('c1000000-0000-0000-0000-000000000006','a1b2c3d4-0001-0001-0001-000000000001','Antifungals'),
  ('c1000000-0000-0000-0000-000000000007','a1b2c3d4-0001-0001-0001-000000000001','Cardiovascular & Diabetes'),
  ('c1000000-0000-0000-0000-000000000008','a1b2c3d4-0001-0001-0001-000000000001','Respiratory'),
  ('c1000000-0000-0000-0000-000000000009','a1b2c3d4-0001-0001-0001-000000000001','Vitamins & Supplements'),
  ('c1000000-0000-0000-0000-00000000000a','a1b2c3d4-0001-0001-0001-000000000001','Skin & Dermatology'),
  ('c1000000-0000-0000-0000-00000000000b','a1b2c3d4-0001-0001-0001-000000000001','Family Planning & Sexual Health'),
  ('c1000000-0000-0000-0000-00000000000c','a1b2c3d4-0001-0001-0001-000000000001','Baby & Mother Care'),
  ('c1000000-0000-0000-0000-00000000000d','a1b2c3d4-0001-0001-0001-000000000001','Personal & Sanitary Care'),
  ('c1000000-0000-0000-0000-00000000000e','a1b2c3d4-0001-0001-0001-000000000001','First Aid & Medical Devices');

-- Subcategories (parent_id = a top-level category; two-level taxonomy)
INSERT INTO categories (id, organization_id, name, parent_id) VALUES
  ('c2000000-0000-0000-0000-000000000001','a1b2c3d4-0001-0001-0001-000000000001','Penicillins','c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002','a1b2c3d4-0001-0001-0001-000000000001','Cephalosporins','c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000003','a1b2c3d4-0001-0001-0001-000000000001','Macrolides','c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000004','a1b2c3d4-0001-0001-0001-000000000001','Quinolones','c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000005','a1b2c3d4-0001-0001-0001-000000000001','Other Antibiotics','c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000006','a1b2c3d4-0001-0001-0001-000000000001','ACT Combinations','c1000000-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000007','a1b2c3d4-0001-0001-0001-000000000001','Other Antimalarials','c1000000-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000008','a1b2c3d4-0001-0001-0001-000000000001','Analgesics & Antipyretics','c1000000-0000-0000-0000-000000000003'),
  ('c2000000-0000-0000-0000-000000000009','a1b2c3d4-0001-0001-0001-000000000001','NSAIDs','c1000000-0000-0000-0000-000000000003'),
  ('c2000000-0000-0000-0000-00000000000a','a1b2c3d4-0001-0001-0001-000000000001','Opioids & Controlled','c1000000-0000-0000-0000-000000000003'),
  ('c2000000-0000-0000-0000-00000000000b','a1b2c3d4-0001-0001-0001-000000000001','Antihistamines','c1000000-0000-0000-0000-000000000004'),
  ('c2000000-0000-0000-0000-00000000000c','a1b2c3d4-0001-0001-0001-000000000001','Cough & Cold','c1000000-0000-0000-0000-000000000004'),
  ('c2000000-0000-0000-0000-00000000000d','a1b2c3d4-0001-0001-0001-000000000001','Antacids & Acid Reducers','c1000000-0000-0000-0000-000000000005'),
  ('c2000000-0000-0000-0000-00000000000e','a1b2c3d4-0001-0001-0001-000000000001','Antidiarrhoeals & ORS','c1000000-0000-0000-0000-000000000005'),
  ('c2000000-0000-0000-0000-00000000000f','a1b2c3d4-0001-0001-0001-000000000001','Dewormers','c1000000-0000-0000-0000-000000000005'),
  ('c2000000-0000-0000-0000-000000000010','a1b2c3d4-0001-0001-0001-000000000001','Antispasmodics','c1000000-0000-0000-0000-000000000005'),
  ('c2000000-0000-0000-0000-000000000011','a1b2c3d4-0001-0001-0001-000000000001','Topical Antifungals','c1000000-0000-0000-0000-000000000006'),
  ('c2000000-0000-0000-0000-000000000012','a1b2c3d4-0001-0001-0001-000000000001','Systemic Antifungals','c1000000-0000-0000-0000-000000000006'),
  ('c2000000-0000-0000-0000-000000000013','a1b2c3d4-0001-0001-0001-000000000001','Antihypertensives','c1000000-0000-0000-0000-000000000007'),
  ('c2000000-0000-0000-0000-000000000014','a1b2c3d4-0001-0001-0001-000000000001','Diabetes Care','c1000000-0000-0000-0000-000000000007'),
  ('c2000000-0000-0000-0000-000000000015','a1b2c3d4-0001-0001-0001-000000000001','Cholesterol','c1000000-0000-0000-0000-000000000007'),
  ('c2000000-0000-0000-0000-000000000016','a1b2c3d4-0001-0001-0001-000000000001','Inhalers','c1000000-0000-0000-0000-000000000008'),
  ('c2000000-0000-0000-0000-000000000017','a1b2c3d4-0001-0001-0001-000000000001','Respiratory Tablets','c1000000-0000-0000-0000-000000000008'),
  ('c2000000-0000-0000-0000-000000000018','a1b2c3d4-0001-0001-0001-000000000001','Vitamins','c1000000-0000-0000-0000-000000000009'),
  ('c2000000-0000-0000-0000-000000000019','a1b2c3d4-0001-0001-0001-000000000001','Minerals & Tonics','c1000000-0000-0000-0000-000000000009'),
  ('c2000000-0000-0000-0000-00000000001a','a1b2c3d4-0001-0001-0001-000000000001','Topical Steroids','c1000000-0000-0000-0000-00000000000a'),
  ('c2000000-0000-0000-0000-00000000001b','a1b2c3d4-0001-0001-0001-000000000001','Other Topicals','c1000000-0000-0000-0000-00000000000a'),
  ('c2000000-0000-0000-0000-00000000001c','a1b2c3d4-0001-0001-0001-000000000001','Contraceptives','c1000000-0000-0000-0000-00000000000b'),
  ('c2000000-0000-0000-0000-00000000001d','a1b2c3d4-0001-0001-0001-000000000001','Condoms','c1000000-0000-0000-0000-00000000000b'),
  ('c2000000-0000-0000-0000-00000000001e','a1b2c3d4-0001-0001-0001-000000000001','Diapers & Wipes','c1000000-0000-0000-0000-00000000000c'),
  ('c2000000-0000-0000-0000-00000000001f','a1b2c3d4-0001-0001-0001-000000000001','Infant Feeding','c1000000-0000-0000-0000-00000000000c'),
  ('c2000000-0000-0000-0000-000000000020','a1b2c3d4-0001-0001-0001-000000000001','Baby Toiletries','c1000000-0000-0000-0000-00000000000c'),
  ('c2000000-0000-0000-0000-000000000021','a1b2c3d4-0001-0001-0001-000000000001','Feminine Care','c1000000-0000-0000-0000-00000000000d'),
  ('c2000000-0000-0000-0000-000000000022','a1b2c3d4-0001-0001-0001-000000000001','Antiseptics & Hygiene','c1000000-0000-0000-0000-00000000000d'),
  ('c2000000-0000-0000-0000-000000000023','a1b2c3d4-0001-0001-0001-000000000001','Medical Devices','c1000000-0000-0000-0000-00000000000e'),
  ('c2000000-0000-0000-0000-000000000024','a1b2c3d4-0001-0001-0001-000000000001','Dressings & Bandages','c1000000-0000-0000-0000-00000000000e'),
  ('c2000000-0000-0000-0000-000000000025','a1b2c3d4-0001-0001-0001-000000000001','PPE','c1000000-0000-0000-0000-00000000000e');

-- ============================================================
-- SUPPLIERS (real Kenyan pharmaceutical distributors)
-- ============================================================

INSERT INTO suppliers (id, organization_id, name, phone, email, address)
VALUES
  ('d1000000-0000-0000-0000-000000000001','a1b2c3d4-0001-0001-0001-000000000001','Dawa Limited','+254 720 000 001','orders@dawa.co.ke','Industrial Area, Nairobi'),
  ('d1000000-0000-0000-0000-000000000002','a1b2c3d4-0001-0001-0001-000000000001','Cosmos Limited','+254 720 000 002','supply@cosmospharma.co.ke','Athi River, Kajiado'),
  ('d1000000-0000-0000-0000-000000000003','a1b2c3d4-0001-0001-0001-000000000001','Elys Chemical Industries','+254 720 000 003','sales@elys.co.ke','Mombasa Road, Nairobi'),
  ('d1000000-0000-0000-0000-000000000004','a1b2c3d4-0001-0001-0001-000000000001','Laboratory & Allied Ltd','+254 720 000 004','orders@laballied.com','Baba Dogo Road, Nairobi'),
  ('d1000000-0000-0000-0000-000000000005','a1b2c3d4-0001-0001-0001-000000000001','Surgipharm Ltd','+254 720 000 005','info@surgipharm.co.ke','Dunga Road, Industrial Area'),
  ('d1000000-0000-0000-0000-000000000006','a1b2c3d4-0001-0001-0001-000000000001','Beta Healthcare International','+254 720 000 006','customercare@betahealthcare.co.ke','Ruaraka, Nairobi'),
  ('d1000000-0000-0000-0000-000000000007','a1b2c3d4-0001-0001-0001-000000000001','Universal Corporation Ltd','+254 720 000 007','sales@unicorp.co.ke','Kikuyu, Kiambu'),
  ('d1000000-0000-0000-0000-000000000008','a1b2c3d4-0001-0001-0001-000000000001','Phillips Pharmaceuticals','+254 720 000 008','orders@phillipspharma.com','Mombasa Road, Nairobi');

-- ============================================================
-- PRODUCTS  (ids auto-generated; batches reference them by SELECT)
-- ============================================================

INSERT INTO products (
  organization_id, category_id,
  name, brand_name, manufacturer, gtin,
  strength, dosage_form,
  base_unit, pack_label, units_per_pack,
  cost_price, selling_price,
  reorder_level, reorder_quantity,
  is_controlled, requires_prescription
)
VALUES
-- ---------- Antibiotics ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Amoxicillin 250mg','Amoxil','GlaxoSmithKline','6160000000011','250mg','Capsule','capsule','Box',100,5.00,10.00,100,500,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Amoxicillin 500mg','Amoxil','GlaxoSmithKline','6160000000028','500mg','Capsule','capsule','Box',100,8.00,15.00,100,500,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Amoxicillin/Clavulanic Acid 625mg','Augmentin','GlaxoSmithKline','6160000000035','625mg','Tablet','tablet','Box',14,60.00,100.00,28,140,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Azithromycin 500mg','Zithromax','Pfizer','6160000000042','500mg','Tablet','tablet','Box',3,45.00,80.00,15,90,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Ciprofloxacin 500mg','Ciprodar','Dawa','6160000000059','500mg','Tablet','tablet','Box',10,8.00,15.00,50,250,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Metronidazole 400mg','Flagyl','Sanofi','6160000000066','400mg','Tablet','tablet','Box',30,3.00,6.00,90,450,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Doxycycline 100mg','Doxal','Laboratory & Allied','6160000000073','100mg','Capsule','capsule','Box',100,4.00,8.00,100,500,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Cefuroxime 250mg','Zinnat','GlaxoSmithKline','6160000000080','250mg','Tablet','tablet','Box',10,80.00,130.00,20,100,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Cotrimoxazole 480mg','Septrin','Aspen','6160000000097','480mg','Tablet','tablet','Box',100,4.00,7.00,100,500,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Erythromycin 250mg','Erythrocin','Abbott','6160000000103','250mg','Tablet','tablet','Box',100,5.00,9.00,80,400,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000001','Ceftriaxone 1g Injection','Rocephin','Roche','6160000000110','1g','Injection','vial','Vial',1,80.00,150.00,20,80,false,true),
-- ---------- Antimalarials ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000002','Artemether/Lumefantrine 20/120','Coartem','Novartis','6160000000127','20/120mg','Tablet','pack','Pack',1,350.00,600.00,30,150,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000002','Artemether/Lumefantrine DS','Lonart DS','Bliss GVS','6160000000134','80/480mg','Tablet','pack','Pack',1,300.00,550.00,30,150,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000002','Dihydroartemisinin/Piperaquine','P-Alaxin','Bliss GVS','6160000000141','40/320mg','Tablet','pack','Pack',1,400.00,700.00,20,100,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000002','Sulfadoxine/Pyrimethamine','Fansidar','Roche','6160000000158','500/25mg','Tablet','tablet','Box',3,20.00,40.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000002','Quinine Sulphate 300mg','Quinine','Dawa','6160000000165','300mg','Tablet','tablet','Box',100,4.00,8.00,50,250,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000002','Malaria Rapid Test Kit','Accurate mRDT','SD Biosensor','6160000000172','1 test','Test Kit','unit','Box',1,120.00,250.00,30,120,false,false),
-- ---------- Pain & Fever ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Paracetamol 500mg','Panadol','GlaxoSmithKline','6160000000189','500mg','Tablet','tablet','Box',100,2.00,5.00,200,1000,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Paracetamol 500mg (Generic)','Paracetamol','Cosmos','6160000000196','500mg','Tablet','tablet','Tin',1000,0.80,2.00,300,2000,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Ibuprofen 400mg','Brufen','Abbott','6160000000202','400mg','Tablet','tablet','Box',100,3.00,6.00,100,500,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Diclofenac 50mg','Voltaren','Novartis','6160000000219','50mg','Tablet','tablet','Box',100,3.00,6.00,100,500,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Aspirin 300mg','Disprin','Reckitt','6160000000226','300mg','Tablet','tablet','Box',100,1.50,4.00,80,400,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Paracetamol Syrup 120mg/5ml 60ml','Calpol','GlaxoSmithKline','6160000000233','120mg/5ml','Syrup','bottle','Bottle',1,60.00,120.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Diclofenac Gel 1% 30g','Voltaren Emulgel','Novartis','6160000000240','1%','Gel','tube','Tube',1,250.00,450.00,15,60,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Ibuprofen + Paracetamol','Brustan','Ranbaxy','6160000000257','400/325mg','Tablet','tablet','Box',100,4.00,8.00,80,400,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Tramadol 50mg','Tramal','Grunenthal','6160000000264','50mg','Capsule','capsule','Box',100,18.00,30.00,30,90,true,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Diazepam 5mg','Valium','Roche','6160000000950','5mg','Tablet','tablet','Box',100,8.00,15.00,30,90,true,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000003','Codeine Phosphate 30mg','Codeine','Dawa','6160000000967','30mg','Tablet','tablet','Box',100,10.00,20.00,30,90,true,true),
-- ---------- Cough, Cold & Allergy ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000004','Cetirizine 10mg','Zyrtec','UCB','6160000000271','10mg','Tablet','tablet','Box',10,5.00,12.00,60,300,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000004','Chlorpheniramine 4mg','Piriton','GlaxoSmithKline','6160000000288','4mg','Tablet','tablet','Tin',1000,1.00,3.00,200,1000,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000004','Loratadine 10mg','Clarityne','Bayer','6160000000295','10mg','Tablet','tablet','Box',10,8.00,15.00,50,250,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000004','Piriton Syrup 100ml','Piriton','GlaxoSmithKline','6160000000301','2mg/5ml','Syrup','bottle','Bottle',1,350.00,550.00,20,80,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000004','Cough Syrup 100ml','Benylin','Johnson & Johnson','6160000000318','100ml','Syrup','bottle','Bottle',1,350.00,600.00,20,80,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000004','Throat Lozenges','Strepsils','Reckitt','6160000000325','24s','Lozenge','pack','Pack',1,150.00,250.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000004','Chest Rub 50g','Vicks VapoRub','Procter & Gamble','6160000000332','50g','Ointment','jar','Jar',1,200.00,350.00,20,80,false,false),
-- ---------- Gastrointestinal ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Omeprazole 20mg','Losec','AstraZeneca','6160000000349','20mg','Capsule','capsule','Box',30,10.00,18.00,60,300,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Esomeprazole 40mg','Nexium','AstraZeneca','6160000000356','40mg','Tablet','tablet','Box',14,40.00,70.00,28,140,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Antacid Sachet','ENO','GlaxoSmithKline','6160000000363','5g','Sachet','sachet','Box',1,15.00,30.00,60,300,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Gaviscon Suspension 200ml','Gaviscon','Reckitt','6160000000370','200ml','Suspension','bottle','Bottle',1,300.00,500.00,20,80,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Loperamide 2mg','Imodium','Johnson & Johnson','6160000000387','2mg','Capsule','capsule','Box',10,6.00,12.00,50,250,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Oral Rehydration Salts','Restors','Cosmos','6160000000394','20.5g','Sachet','sachet','Box',1,15.00,25.00,60,300,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Zinc Sulphate 20mg','Zincomed','Cosmos','6160000000400','20mg','Tablet','tablet','Box',100,2.00,4.00,80,400,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Albendazole 400mg','Zentel','GlaxoSmithKline','6160000000417','400mg','Tablet','tablet','Box',1,25.00,40.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Mebendazole 100mg','Vermox','Johnson & Johnson','6160000000424','100mg','Tablet','tablet','Box',6,8.00,15.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000005','Hyoscine Butylbromide 10mg','Buscopan','Sanofi','6160000000431','10mg','Tablet','tablet','Box',10,10.00,18.00,40,200,false,false),
-- ---------- Antifungals ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000006','Fluconazole 150mg','Diflucan','Pfizer','6160000000448','150mg','Capsule','capsule','Box',1,55.00,100.00,30,120,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000006','Clotrimazole Cream 1% 20g','Canesten','Bayer','6160000000455','1%','Cream','tube','Tube',1,200.00,350.00,20,80,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000006','Ketoconazole Shampoo 100ml','Nizoral','Johnson & Johnson','6160000000462','2%','Shampoo','bottle','Bottle',1,400.00,650.00,15,60,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000006','Griseofulvin 500mg','Grisovin','GlaxoSmithKline','6160000000479','500mg','Tablet','tablet','Box',100,8.00,15.00,40,200,false,true),
-- ---------- Cardiovascular & Diabetes ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000007','Amlodipine 5mg','Norvasc','Pfizer','6160000000486','5mg','Tablet','tablet','Box',30,3.00,6.00,90,450,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000007','Losartan 50mg','Cozaar','MSD','6160000000493','50mg','Tablet','tablet','Box',30,8.00,15.00,60,300,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000007','Atenolol 50mg','Tenormin','AstraZeneca','6160000000509','50mg','Tablet','tablet','Box',28,3.00,6.00,60,300,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000007','Metformin 500mg','Glucophage','Merck','6160000000516','500mg','Tablet','tablet','Box',100,2.00,4.00,120,600,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000007','Glibenclamide 5mg','Daonil','Sanofi','6160000000523','5mg','Tablet','tablet','Box',100,2.00,4.00,80,400,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000007','Atorvastatin 20mg','Lipitor','Pfizer','6160000000530','20mg','Tablet','tablet','Box',30,10.00,20.00,60,300,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000007','Hydrochlorothiazide 25mg','Hydrochlorothiazide','Dawa','6160000000547','25mg','Tablet','tablet','Box',100,2.00,5.00,60,300,false,true),
-- ---------- Respiratory ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000008','Salbutamol Inhaler 100mcg','Ventolin','GlaxoSmithKline','6160000000554','100mcg','Inhaler','unit','Inhaler',1,350.00,600.00,20,80,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000008','Salbutamol 4mg','Salbutamol','Cosmos','6160000000561','4mg','Tablet','tablet','Box',100,2.00,5.00,60,300,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000008','Beclomethasone Inhaler','Beclate','Cipla','6160000000578','100mcg','Inhaler','unit','Inhaler',1,450.00,750.00,15,60,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000008','Montelukast 10mg','Singulair','MSD','6160000000585','10mg','Tablet','tablet','Box',30,25.00,45.00,30,150,false,true),
-- ---------- Vitamins & Supplements ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000009','Vitamin C 500mg','Redoxon','Bayer','6160000000592','500mg','Tablet','tablet','Box',100,3.00,6.00,100,500,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000009','Multivitamin Syrup 200ml','Seven Seas','Merck','6160000000608','200ml','Syrup','bottle','Bottle',1,180.00,320.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000009','Ferrous Sulphate + Folic Acid','Ranferon','Ranbaxy','6160000000615','200mg','Tablet','tablet','Box',100,3.00,6.00,80,400,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000009','Folic Acid 5mg','Folic Acid','Dawa','6160000000622','5mg','Tablet','tablet','Box',100,1.00,3.00,80,400,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000009','Calcium + Vitamin D3','Caltrate','Pfizer','6160000000639','600mg/400IU','Tablet','tablet','Box',30,10.00,20.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000009','Cod Liver Oil Capsules','Seven Seas','Merck','6160000000646','1000mg','Capsule','capsule','Box',60,5.00,10.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-000000000009','Zinc + Multivitamin Syrup 200ml','Zincovit','Apex','6160000000653','200ml','Syrup','bottle','Bottle',1,200.00,350.00,30,120,false,false),
-- ---------- Skin & Dermatology ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000a','Hydrocortisone Cream 1% 15g','Hydrocortisone','Beta Healthcare','6160000000660','1%','Cream','tube','Tube',1,80.00,150.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000a','Betamethasone Cream 0.1% 15g','Betnovate','GlaxoSmithKline','6160000000677','0.1%','Cream','tube','Tube',1,120.00,220.00,20,80,false,true),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000a','Whitfield Ointment 25g','Whitfield','Cosmos','6160000000684','25g','Ointment','tube','Tube',1,50.00,100.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000a','Calamine Lotion 100ml','Calamine','Beta Healthcare','6160000000691','100ml','Lotion','bottle','Bottle',1,80.00,150.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000a','Povidone Iodine 10% 100ml','Betadine','Mundipharma','6160000000707','10%','Solution','bottle','Bottle',1,150.00,280.00,20,80,false,false),
-- ---------- Family Planning & Sexual Health ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000b','Levonorgestrel Emergency Pill','Postinor-2','Gedeon Richter','6160000000714','1.5mg','Tablet','pack','Pack',1,100.00,200.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000b','Combined Oral Contraceptive','Microgynon','Bayer','6160000000721','30mcg','Tablet','pack','Pack',1,40.00,80.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000b','Condoms 3-pack','Trust','PSI Kenya','6160000000738','3s','Condom','pack','Pack',1,20.00,50.00,100,500,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000b','Condoms Premium 3-pack','Durex','Reckitt','6160000000745','3s','Condom','pack','Pack',1,200.00,350.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000b','Pregnancy Test Strip','Quickcheck','SD Biosensor','6160000000752','1 test','Test Kit','unit','Box',1,25.00,60.00,60,300,false,false),
-- ---------- Baby & Mother Care ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000c','Baby Diapers Medium 44s','Pampers','Procter & Gamble','6160000000769','Medium','Diapers','pack','Pack',1,900.00,1300.00,20,80,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000c','Baby Diapers Large 38s','Huggies','Kimberly-Clark','6160000000776','Large','Diapers','pack','Pack',1,700.00,1100.00,20,80,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000c','Infant Cereal Wheat 400g','Cerelac','Nestle','6160000000783','400g','Cereal','tin','Tin',1,500.00,750.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000c','Infant Formula 400g','NAN','Nestle','6160000000790','400g','Formula','tin','Tin',1,900.00,1250.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000c','Baby Jelly 250ml','Johnsons','Johnson & Johnson','6160000000806','250ml','Jelly','jar','Jar',1,200.00,350.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000c','Baby Wipes 64s','Pampers','Procter & Gamble','6160000000813','64s','Wipes','pack','Pack',1,150.00,280.00,40,200,false,false),
-- ---------- Personal & Sanitary Care ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000d','Sanitary Pads Maxi 8s','Always','Procter & Gamble','6160000000820','8s','Pads','pack','Pack',1,80.00,150.00,80,400,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000d','Surgical Spirit 100ml','Surgical Spirit','Beta Healthcare','6160000000837','100ml','Solution','bottle','Bottle',1,50.00,100.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000d','Hand Sanitizer 100ml','Dettol','Reckitt','6160000000844','100ml','Gel','bottle','Bottle',1,80.00,150.00,60,300,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000d','Antiseptic Liquid 250ml','Dettol','Reckitt','6160000000851','250ml','Liquid','bottle','Bottle',1,250.00,420.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000d','Cotton Wool 100g','Cotton Wool','Beta Healthcare','6160000000868','100g','Cotton','roll','Roll',1,60.00,120.00,40,200,false,false),
-- ---------- First Aid & Medical Devices ----------
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000e','Digital Thermometer','Microlife','Microlife','6160000000875','1 unit','Device','unit','Box',1,250.00,450.00,15,60,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000e','Blood Pressure Monitor','Omron M2','Omron','6160000000882','1 unit','Device','unit','Box',1,4500.00,6500.00,5,20,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000e','Glucometer Kit','Accu-Chek Active','Roche','6160000000899','1 unit','Device','unit','Box',1,2800.00,4000.00,5,20,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000e','Glucose Test Strips 50s','Accu-Chek Active','Roche','6160000000905','50s','Strips','pack','Pack',1,1500.00,2200.00,15,60,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000e','Adhesive Bandages 20s','Elastoplast','Beiersdorf','6160000000912','20s','Plasters','pack','Pack',1,80.00,150.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000e','Face Masks 50s','Surgical Mask','Surgipharm','6160000000929','50s','Masks','box','Box',1,200.00,350.00,40,200,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000e','Examination Gloves 100s','Latex Gloves','Surgipharm','6160000000936','100s','Gloves','box','Box',1,400.00,650.00,30,120,false,false),
('a1b2c3d4-0001-0001-0001-000000000001','c1000000-0000-0000-0000-00000000000e','Crepe Bandage 7.5cm','Crepe Bandage','Beta Healthcare','6160000000943','7.5cm','Bandage','unit','Box',1,80.00,150.00,40,200,false,false);

-- ============================================================
-- PRODUCT BATCHES (generated per product at the CBD branch)
-- ------------------------------------------------------------
-- Two batches per product (older + newer) with a deterministic mix of
-- conditions keyed off the product's row number, so the inventory and
-- dashboard alerts show a realistic spread:
--   rn % 12 = 0  -> OUT OF STOCK   (both batches depleted)
--   rn % 8  = 0  -> LOW STOCK      (below reorder level)
--   rn % 9  = 0  -> NEAR EXPIRY    (older batch expires in ~18 days, in stock)
--   rn % 15 = 0  -> EXPIRED LOT    (older batch already expired, still on shelf)
--   else         -> HEALTHY        (partial older + full newer)
-- ============================================================

WITH p AS (
  SELECT id, reorder_level, reorder_quantity, cost_price,
         row_number() OVER (ORDER BY created_at, name) AS rn
  FROM products
  WHERE organization_id = 'a1b2c3d4-0001-0001-0001-000000000001'
),
classified AS (
  SELECT *,
    CASE
      WHEN rn % 12 = 0 THEN 'out'
      WHEN rn % 8  = 0 THEN 'low'
      WHEN rn % 9  = 0 THEN 'nearexp'
      WHEN rn % 15 = 0 THEN 'expired'
      ELSE 'ok'
    END AS cond,
    GREATEST(reorder_quantity, 12) AS qty_recv
  FROM p
),
seq AS (SELECT generate_series(1,2) AS n)
INSERT INTO product_batches (
  product_id, branch_id, supplier_id,
  batch_number, expiry_date, manufactured_date,
  quantity_received, quantity_remaining,
  cost_price, received_at
)
SELECT
  c.id,
  'b1b2c3d4-0002-0002-0002-000000000001',
  (ARRAY[
    'd1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000003',
    'd1000000-0000-0000-0000-000000000004',
    'd1000000-0000-0000-0000-000000000005',
    'd1000000-0000-0000-0000-000000000006',
    'd1000000-0000-0000-0000-000000000007',
    'd1000000-0000-0000-0000-000000000008'
  ])[1 + ((c.rn + s.n) % 8)]::uuid,
  'BN' || to_char(
      now() - (interval '1 day' * (CASE WHEN s.n = 1 THEN 220 + (c.rn % 90) ELSE 40 + (c.rn % 60) END)::int),
      'YYMMDD') || lpad(c.rn::text, 3, '0') || s.n::text,
  -- expiry date
  CASE
    WHEN s.n = 1 AND c.cond = 'nearexp' THEN current_date + 18
    WHEN s.n = 1 AND c.cond = 'expired' THEN current_date - 20
    WHEN s.n = 1 THEN current_date + (270 + ((c.rn * 7) % 200))::int
    ELSE current_date + (500 + ((c.rn * 11) % 400))::int
  END,
  -- manufactured date
  (now() - (interval '1 day' * (CASE WHEN s.n = 1 THEN 280 + (c.rn % 90) ELSE 100 + (c.rn % 60) END)::int))::date,
  c.qty_recv,
  -- quantity remaining
  CASE
    WHEN c.cond = 'out' THEN 0
    WHEN c.cond = 'low'  AND s.n = 1 THEN 0
    WHEN c.cond = 'low'  AND s.n = 2 THEN GREATEST((c.reorder_level * 0.4)::int, 1)
    WHEN s.n = 1 AND c.cond = 'expired' THEN (c.qty_recv * 0.30)::int
    WHEN s.n = 1 THEN (c.qty_recv * (0.35 + ((c.rn % 5) * 0.05)))::int
    ELSE c.qty_recv
  END,
  c.cost_price,
  now() - (interval '1 day' * (CASE WHEN s.n = 1 THEN 220 + (c.rn % 90) ELSE 40 + (c.rn % 60) END)::int)
FROM classified c CROSS JOIN seq s;

-- ============================================================
-- PRODUCT IMAGES
-- ------------------------------------------------------------
-- Each product is mapped to a shared, freely-licensed category photo
-- stored under apps/web/public/products/. Mapping is by name keyword,
-- dosage form, then category (most specific first).
-- ============================================================

UPDATE products SET image_url = '/products/' || (CASE
  WHEN name ILIKE '%Blood Pressure%' THEN 'bp'
  WHEN name ILIKE '%Glucometer%' OR name ILIKE '%Glucose Test Strips%' THEN 'glucometer'
  WHEN name ILIKE '%Thermometer%' THEN 'thermometer'
  WHEN name ILIKE '%Malaria Rapid Test%' OR name ILIKE '%Pregnancy Test%' THEN 'testkit'
  WHEN name ILIKE '%Face Masks%' THEN 'masks'
  WHEN name ILIKE '%Gloves%' THEN 'gloves'
  WHEN name ILIKE '%Bandage%' OR name ILIKE '%Cotton Wool%' THEN 'firstaid'
  WHEN name ILIKE '%Surgical Spirit%' OR name ILIKE '%Hand Sanitizer%' OR name ILIKE '%Antiseptic%' OR name ILIKE '%Povidone%' THEN 'antiseptic'
  WHEN name ILIKE '%Sanitary Pads%' THEN 'sanitary'
  WHEN name ILIKE '%Diapers%' THEN 'diapers'
  WHEN name ILIKE '%Infant Formula%' OR name ILIKE '%Infant Cereal%' THEN 'babyformula'
  WHEN name ILIKE '%Baby Wipes%' OR name ILIKE '%Baby Jelly%' THEN 'babycare'
  WHEN dosage_form = 'Inhaler' THEN 'inhaler'
  WHEN dosage_form = 'Injection' THEN 'vial'
  WHEN dosage_form = 'Sachet' THEN 'sachet'
  WHEN dosage_form IN ('Cream','Ointment','Gel','Lotion') OR name ILIKE '%Shampoo%' THEN 'cream'
  WHEN dosage_form IN ('Syrup','Suspension') THEN 'syrup'
  WHEN category_id = 'c1000000-0000-0000-0000-00000000000b' THEN 'contraceptive'
  WHEN category_id = 'c1000000-0000-0000-0000-000000000009' THEN 'supplement'
  WHEN pack_label = 'Tin' AND dosage_form = 'Tablet' THEN 'pillsbottle'
  WHEN dosage_form = 'Capsule' THEN 'capsules'
  ELSE 'tablets'
END) || '.jpg'
WHERE organization_id = 'a1b2c3d4-0001-0001-0001-000000000001';

-- ============================================================
-- ASSIGN PRODUCTS TO LEAF SUBCATEGORIES
-- ------------------------------------------------------------
-- Runs AFTER the image mapping above (which keys off the original top-level
-- category_id for a couple of fallbacks). Two test kits intentionally remain
-- at their top-level category. A product may sit directly under a top-level
-- category — a subcategory is optional.
-- ============================================================

UPDATE products p
SET category_id = m.sub::uuid
FROM (VALUES
  ('Amoxicillin 250mg','c2000000-0000-0000-0000-000000000001'),
  ('Amoxicillin 500mg','c2000000-0000-0000-0000-000000000001'),
  ('Amoxicillin/Clavulanic Acid 625mg','c2000000-0000-0000-0000-000000000001'),
  ('Cefuroxime 250mg','c2000000-0000-0000-0000-000000000002'),
  ('Ceftriaxone 1g Injection','c2000000-0000-0000-0000-000000000002'),
  ('Azithromycin 500mg','c2000000-0000-0000-0000-000000000003'),
  ('Erythromycin 250mg','c2000000-0000-0000-0000-000000000003'),
  ('Ciprofloxacin 500mg','c2000000-0000-0000-0000-000000000004'),
  ('Metronidazole 400mg','c2000000-0000-0000-0000-000000000005'),
  ('Doxycycline 100mg','c2000000-0000-0000-0000-000000000005'),
  ('Cotrimoxazole 480mg','c2000000-0000-0000-0000-000000000005'),
  ('Artemether/Lumefantrine 20/120','c2000000-0000-0000-0000-000000000006'),
  ('Artemether/Lumefantrine DS','c2000000-0000-0000-0000-000000000006'),
  ('Dihydroartemisinin/Piperaquine','c2000000-0000-0000-0000-000000000006'),
  ('Sulfadoxine/Pyrimethamine','c2000000-0000-0000-0000-000000000007'),
  ('Quinine Sulphate 300mg','c2000000-0000-0000-0000-000000000007'),
  ('Paracetamol 500mg','c2000000-0000-0000-0000-000000000008'),
  ('Paracetamol 500mg (Generic)','c2000000-0000-0000-0000-000000000008'),
  ('Aspirin 300mg','c2000000-0000-0000-0000-000000000008'),
  ('Paracetamol Syrup 120mg/5ml 60ml','c2000000-0000-0000-0000-000000000008'),
  ('Ibuprofen 400mg','c2000000-0000-0000-0000-000000000009'),
  ('Diclofenac 50mg','c2000000-0000-0000-0000-000000000009'),
  ('Diclofenac Gel 1% 30g','c2000000-0000-0000-0000-000000000009'),
  ('Ibuprofen + Paracetamol','c2000000-0000-0000-0000-000000000009'),
  ('Tramadol 50mg','c2000000-0000-0000-0000-00000000000a'),
  ('Diazepam 5mg','c2000000-0000-0000-0000-00000000000a'),
  ('Codeine Phosphate 30mg','c2000000-0000-0000-0000-00000000000a'),
  ('Cetirizine 10mg','c2000000-0000-0000-0000-00000000000b'),
  ('Chlorpheniramine 4mg','c2000000-0000-0000-0000-00000000000b'),
  ('Loratadine 10mg','c2000000-0000-0000-0000-00000000000b'),
  ('Piriton Syrup 100ml','c2000000-0000-0000-0000-00000000000b'),
  ('Cough Syrup 100ml','c2000000-0000-0000-0000-00000000000c'),
  ('Throat Lozenges','c2000000-0000-0000-0000-00000000000c'),
  ('Chest Rub 50g','c2000000-0000-0000-0000-00000000000c'),
  ('Omeprazole 20mg','c2000000-0000-0000-0000-00000000000d'),
  ('Esomeprazole 40mg','c2000000-0000-0000-0000-00000000000d'),
  ('Antacid Sachet','c2000000-0000-0000-0000-00000000000d'),
  ('Gaviscon Suspension 200ml','c2000000-0000-0000-0000-00000000000d'),
  ('Loperamide 2mg','c2000000-0000-0000-0000-00000000000e'),
  ('Oral Rehydration Salts','c2000000-0000-0000-0000-00000000000e'),
  ('Zinc Sulphate 20mg','c2000000-0000-0000-0000-00000000000e'),
  ('Albendazole 400mg','c2000000-0000-0000-0000-00000000000f'),
  ('Mebendazole 100mg','c2000000-0000-0000-0000-00000000000f'),
  ('Hyoscine Butylbromide 10mg','c2000000-0000-0000-0000-000000000010'),
  ('Clotrimazole Cream 1% 20g','c2000000-0000-0000-0000-000000000011'),
  ('Ketoconazole Shampoo 100ml','c2000000-0000-0000-0000-000000000011'),
  ('Fluconazole 150mg','c2000000-0000-0000-0000-000000000012'),
  ('Griseofulvin 500mg','c2000000-0000-0000-0000-000000000012'),
  ('Amlodipine 5mg','c2000000-0000-0000-0000-000000000013'),
  ('Losartan 50mg','c2000000-0000-0000-0000-000000000013'),
  ('Atenolol 50mg','c2000000-0000-0000-0000-000000000013'),
  ('Hydrochlorothiazide 25mg','c2000000-0000-0000-0000-000000000013'),
  ('Metformin 500mg','c2000000-0000-0000-0000-000000000014'),
  ('Glibenclamide 5mg','c2000000-0000-0000-0000-000000000014'),
  ('Atorvastatin 20mg','c2000000-0000-0000-0000-000000000015'),
  ('Salbutamol Inhaler 100mcg','c2000000-0000-0000-0000-000000000016'),
  ('Beclomethasone Inhaler','c2000000-0000-0000-0000-000000000016'),
  ('Salbutamol 4mg','c2000000-0000-0000-0000-000000000017'),
  ('Montelukast 10mg','c2000000-0000-0000-0000-000000000017'),
  ('Vitamin C 500mg','c2000000-0000-0000-0000-000000000018'),
  ('Multivitamin Syrup 200ml','c2000000-0000-0000-0000-000000000018'),
  ('Folic Acid 5mg','c2000000-0000-0000-0000-000000000018'),
  ('Cod Liver Oil Capsules','c2000000-0000-0000-0000-000000000018'),
  ('Ferrous Sulphate + Folic Acid','c2000000-0000-0000-0000-000000000019'),
  ('Calcium + Vitamin D3','c2000000-0000-0000-0000-000000000019'),
  ('Zinc + Multivitamin Syrup 200ml','c2000000-0000-0000-0000-000000000019'),
  ('Hydrocortisone Cream 1% 15g','c2000000-0000-0000-0000-00000000001a'),
  ('Betamethasone Cream 0.1% 15g','c2000000-0000-0000-0000-00000000001a'),
  ('Whitfield Ointment 25g','c2000000-0000-0000-0000-00000000001b'),
  ('Calamine Lotion 100ml','c2000000-0000-0000-0000-00000000001b'),
  ('Povidone Iodine 10% 100ml','c2000000-0000-0000-0000-00000000001b'),
  ('Levonorgestrel Emergency Pill','c2000000-0000-0000-0000-00000000001c'),
  ('Combined Oral Contraceptive','c2000000-0000-0000-0000-00000000001c'),
  ('Condoms 3-pack','c2000000-0000-0000-0000-00000000001d'),
  ('Condoms Premium 3-pack','c2000000-0000-0000-0000-00000000001d'),
  ('Baby Diapers Medium 44s','c2000000-0000-0000-0000-00000000001e'),
  ('Baby Diapers Large 38s','c2000000-0000-0000-0000-00000000001e'),
  ('Baby Wipes 64s','c2000000-0000-0000-0000-00000000001e'),
  ('Infant Cereal Wheat 400g','c2000000-0000-0000-0000-00000000001f'),
  ('Infant Formula 400g','c2000000-0000-0000-0000-00000000001f'),
  ('Baby Jelly 250ml','c2000000-0000-0000-0000-000000000020'),
  ('Sanitary Pads Maxi 8s','c2000000-0000-0000-0000-000000000021'),
  ('Surgical Spirit 100ml','c2000000-0000-0000-0000-000000000022'),
  ('Hand Sanitizer 100ml','c2000000-0000-0000-0000-000000000022'),
  ('Antiseptic Liquid 250ml','c2000000-0000-0000-0000-000000000022'),
  ('Digital Thermometer','c2000000-0000-0000-0000-000000000023'),
  ('Blood Pressure Monitor','c2000000-0000-0000-0000-000000000023'),
  ('Glucometer Kit','c2000000-0000-0000-0000-000000000023'),
  ('Glucose Test Strips 50s','c2000000-0000-0000-0000-000000000023'),
  ('Adhesive Bandages 20s','c2000000-0000-0000-0000-000000000024'),
  ('Crepe Bandage 7.5cm','c2000000-0000-0000-0000-000000000024'),
  ('Cotton Wool 100g','c2000000-0000-0000-0000-000000000024'),
  ('Face Masks 50s','c2000000-0000-0000-0000-000000000025'),
  ('Examination Gloves 100s','c2000000-0000-0000-0000-000000000025')
) AS m(key, sub)
WHERE p.organization_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND m.key = p.name;
