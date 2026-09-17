// ADR-014 — bundled KEML drug catalog for the offline build's "Drug catalog"
// quick-seed screen (app/catalog-seed.tsx). Transcribed verbatim from
// infra/migrations/007_drug_catalog_seed.sql (the ~95-row KEML/PPB identity
// -only seed CLAUDE.md §6.4 describes) — NOT the larger 459+/810+-row
// enriched retail catalogue added by later migrations (010/011/015), which
// depends on a live DB dump this offline build has no way to fetch. Category
// labels are carried over from that SQL file's section comments (not a real
// column there — added here purely to power this screen's per-department
// breakdown, mirroring the web app's `drug_catalog.category` column).

export interface KemlCatalogEntry {
  id: string
  name: string
  strength: string | null
  dosageForm: string | null
  baseUnit: string
  isControlled: boolean
  requiresPrescription: boolean
  category: string
}

const row = (
  id: string,
  name: string,
  strength: string | null,
  dosageForm: string,
  baseUnit: string,
  isControlled: boolean,
  requiresPrescription: boolean,
  category: string,
): KemlCatalogEntry => ({ id, name, strength, dosageForm, baseUnit, isControlled, requiresPrescription, category })

const ANALGESICS = "Analgesics & Antipyretics"
const ANTIBIOTICS = "Antibiotics"
const ANTIMALARIALS = "Antimalarials"
const CARDIOVASCULAR = "Cardiovascular & Diuretics"
const ANTIDIABETICS = "Antidiabetics"
const GI = "GI & Antacids"
const RESPIRATORY = "Antihistamines & Respiratory"
const STEROIDS = "Steroids & Antifungals"
const TOPICALS = "Topicals"
const DEWORMERS = "Dewormers"
const VITAMINS = "Vitamins & Supplements"
const CONTROLLED_CNS = "Controlled & CNS"
const CONSUMABLES = "Consumables"

export const KEML_CATALOG: KemlCatalogEntry[] = [
  // Analgesics / antipyretics / NSAIDs
  row("keml-001", "Paracetamol", "500mg", "Tablet", "tablet", false, false, ANALGESICS),
  row("keml-002", "Paracetamol", "120mg/5ml", "Syrup", "bottle", false, false, ANALGESICS),
  row("keml-003", "Ibuprofen", "200mg", "Tablet", "tablet", false, false, ANALGESICS),
  row("keml-004", "Ibuprofen", "400mg", "Tablet", "tablet", false, false, ANALGESICS),
  row("keml-005", "Diclofenac", "50mg", "Tablet", "tablet", false, true, ANALGESICS),
  row("keml-006", "Aspirin", "75mg", "Tablet", "tablet", false, false, ANALGESICS),
  row("keml-007", "Aspirin", "300mg", "Tablet", "tablet", false, false, ANALGESICS),
  row("keml-008", "Tramadol", "50mg", "Capsule", "capsule", true, true, ANALGESICS),
  row("keml-009", "Diclofenac", "1%", "Gel", "tube", false, false, ANALGESICS),
  // Antibiotics
  row("keml-010", "Amoxicillin", "250mg", "Capsule", "capsule", false, true, ANTIBIOTICS),
  row("keml-011", "Amoxicillin", "500mg", "Capsule", "capsule", false, true, ANTIBIOTICS),
  row("keml-012", "Amoxicillin", "125mg/5ml", "Suspension", "bottle", false, true, ANTIBIOTICS),
  row("keml-013", "Amoxicillin/Clavulanic Acid", "625mg", "Tablet", "tablet", false, true, ANTIBIOTICS),
  row("keml-014", "Azithromycin", "500mg", "Tablet", "tablet", false, true, ANTIBIOTICS),
  row("keml-015", "Ciprofloxacin", "500mg", "Tablet", "tablet", false, true, ANTIBIOTICS),
  row("keml-016", "Metronidazole", "200mg", "Tablet", "tablet", false, true, ANTIBIOTICS),
  row("keml-017", "Metronidazole", "400mg", "Tablet", "tablet", false, true, ANTIBIOTICS),
  row("keml-018", "Doxycycline", "100mg", "Capsule", "capsule", false, true, ANTIBIOTICS),
  row("keml-019", "Cotrimoxazole", "480mg", "Tablet", "tablet", false, true, ANTIBIOTICS),
  row("keml-020", "Cephalexin", "500mg", "Capsule", "capsule", false, true, ANTIBIOTICS),
  row("keml-021", "Erythromycin", "250mg", "Tablet", "tablet", false, true, ANTIBIOTICS),
  row("keml-022", "Clindamycin", "300mg", "Capsule", "capsule", false, true, ANTIBIOTICS),
  row("keml-023", "Ceftriaxone", "1g", "Injection", "vial", false, true, ANTIBIOTICS),
  row("keml-024", "Nitrofurantoin", "100mg", "Tablet", "tablet", false, true, ANTIBIOTICS),
  // Antimalarials
  row("keml-025", "Artemether/Lumefantrine", "20/120mg", "Tablet", "tablet", false, true, ANTIMALARIALS),
  row("keml-026", "Dihydroartemisinin/Piperaquine", "40/320mg", "Tablet", "tablet", false, true, ANTIMALARIALS),
  row("keml-027", "Sulfadoxine/Pyrimethamine", "500/25mg", "Tablet", "tablet", false, true, ANTIMALARIALS),
  row("keml-028", "Quinine", "300mg", "Tablet", "tablet", false, true, ANTIMALARIALS),
  // Antihypertensives / cardiac / diuretics
  row("keml-029", "Amlodipine", "5mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-030", "Amlodipine", "10mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-031", "Nifedipine", "20mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-032", "Losartan", "50mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-033", "Enalapril", "5mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-034", "Lisinopril", "10mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-035", "Atenolol", "50mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-036", "Hydrochlorothiazide", "25mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-037", "Furosemide", "40mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-038", "Methyldopa", "250mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-039", "Atorvastatin", "20mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  row("keml-040", "Simvastatin", "20mg", "Tablet", "tablet", false, true, CARDIOVASCULAR),
  // Antidiabetics
  row("keml-041", "Metformin", "500mg", "Tablet", "tablet", false, true, ANTIDIABETICS),
  row("keml-042", "Metformin", "850mg", "Tablet", "tablet", false, true, ANTIDIABETICS),
  row("keml-043", "Glibenclamide", "5mg", "Tablet", "tablet", false, true, ANTIDIABETICS),
  row("keml-044", "Glimepiride", "2mg", "Tablet", "tablet", false, true, ANTIDIABETICS),
  // GI / antacids / PPIs
  row("keml-045", "Omeprazole", "20mg", "Capsule", "capsule", false, false, GI),
  row("keml-046", "Esomeprazole", "40mg", "Tablet", "tablet", false, true, GI),
  row("keml-047", "Ranitidine", "150mg", "Tablet", "tablet", false, false, GI),
  row("keml-048", "Magnesium Trisilicate", null, "Suspension", "bottle", false, false, GI),
  row("keml-049", "Hyoscine Butylbromide", "10mg", "Tablet", "tablet", false, false, GI),
  row("keml-050", "Loperamide", "2mg", "Capsule", "capsule", false, false, GI),
  row("keml-051", "Metoclopramide", "10mg", "Tablet", "tablet", false, true, GI),
  row("keml-052", "Ondansetron", "4mg", "Tablet", "tablet", false, true, GI),
  row("keml-053", "Bisacodyl", "5mg", "Tablet", "tablet", false, false, GI),
  row("keml-054", "Oral Rehydration Salts", null, "Sachet", "sachet", false, false, GI),
  // Antihistamines / respiratory
  row("keml-055", "Cetirizine", "10mg", "Tablet", "tablet", false, false, RESPIRATORY),
  row("keml-056", "Loratadine", "10mg", "Tablet", "tablet", false, false, RESPIRATORY),
  row("keml-057", "Chlorpheniramine", "4mg", "Tablet", "tablet", false, false, RESPIRATORY),
  row("keml-058", "Promethazine", "25mg", "Tablet", "tablet", false, false, RESPIRATORY),
  row("keml-059", "Salbutamol", "4mg", "Tablet", "tablet", false, true, RESPIRATORY),
  row("keml-060", "Salbutamol", "100mcg", "Inhaler", "inhaler", false, true, RESPIRATORY),
  row("keml-061", "Cough Syrup (Bronchostop)", null, "Syrup", "bottle", false, false, RESPIRATORY),
  // Steroids / antifungals
  row("keml-062", "Prednisolone", "5mg", "Tablet", "tablet", false, true, STEROIDS),
  row("keml-063", "Dexamethasone", "0.5mg", "Tablet", "tablet", false, true, STEROIDS),
  row("keml-064", "Fluconazole", "150mg", "Capsule", "capsule", false, false, STEROIDS),
  row("keml-065", "Ketoconazole", "200mg", "Tablet", "tablet", false, true, STEROIDS),
  row("keml-066", "Griseofulvin", "500mg", "Tablet", "tablet", false, true, STEROIDS),
  // Topicals
  row("keml-067", "Hydrocortisone", "1%", "Cream", "tube", false, false, TOPICALS),
  row("keml-068", "Clotrimazole", "1%", "Cream", "tube", false, false, TOPICALS),
  row("keml-069", "Betamethasone", "0.1%", "Cream", "tube", false, true, TOPICALS),
  row("keml-070", "Whitfield Ointment", null, "Ointment", "tube", false, false, TOPICALS),
  row("keml-071", "Gentian Violet", null, "Paint", "bottle", false, false, TOPICALS),
  // Dewormers
  row("keml-072", "Albendazole", "400mg", "Tablet", "tablet", false, false, DEWORMERS),
  row("keml-073", "Mebendazole", "100mg", "Tablet", "tablet", false, false, DEWORMERS),
  // Vitamins / supplements
  row("keml-074", "Vitamin C (Ascorbic Acid)", "500mg", "Tablet", "tablet", false, false, VITAMINS),
  row("keml-075", "Multivitamin", null, "Tablet", "tablet", false, false, VITAMINS),
  row("keml-076", "Ferrous Sulphate", "200mg", "Tablet", "tablet", false, false, VITAMINS),
  row("keml-077", "Folic Acid", "5mg", "Tablet", "tablet", false, false, VITAMINS),
  row("keml-078", "Ferrous + Folic Acid", null, "Tablet", "tablet", false, false, VITAMINS),
  row("keml-079", "Zinc Sulphate", "20mg", "Tablet", "tablet", false, false, VITAMINS),
  row("keml-080", "Calcium + Vitamin D3", null, "Tablet", "tablet", false, false, VITAMINS),
  row("keml-081", "Vitamin B Complex", null, "Tablet", "tablet", false, false, VITAMINS),
  // Controlled / CNS
  row("keml-082", "Diazepam", "5mg", "Tablet", "tablet", true, true, CONTROLLED_CNS),
  row("keml-083", "Phenobarbital", "30mg", "Tablet", "tablet", true, true, CONTROLLED_CNS),
  row("keml-084", "Amitriptyline", "25mg", "Tablet", "tablet", false, true, CONTROLLED_CNS),
  // Common consumables / non-drug essentials
  row("keml-085", "Surgical Spirit", null, "Liquid", "bottle", false, false, CONSUMABLES),
  row("keml-086", "Hydrogen Peroxide", null, "Liquid", "bottle", false, false, CONSUMABLES),
  row("keml-087", "Absorbent Cotton Wool", null, "Roll", "piece", false, false, CONSUMABLES),
  row("keml-088", "Elastic Adhesive Bandage", null, "Roll", "piece", false, false, CONSUMABLES),
  row("keml-089", "Disposable Syringe", "5ml", "Syringe", "piece", false, false, CONSUMABLES),
  row("keml-090", "Examination Gloves", null, "Pair", "piece", false, false, CONSUMABLES),
  row("keml-091", "Adhesive Plaster", null, "Strip", "piece", false, false, CONSUMABLES),
  row("keml-092", "Male Condom", null, "Unit", "piece", false, false, CONSUMABLES),
  row("keml-093", "Pregnancy Test Kit", null, "Kit", "piece", false, false, CONSUMABLES),
  row("keml-094", "Glucose Test Strips", null, "Strip", "piece", false, false, CONSUMABLES),
  row("keml-095", "Face Mask (Surgical)", null, "Unit", "piece", false, false, CONSUMABLES),
]
