// ADR-014 — bundled DUR (Drug Utilization Review) reference dataset for the
// offline build. Investigation finding worth recording: the ONLINE app has
// no larger dataset to port from either — infra/migrations/004_domain.sql
// only CREATEs an empty drug_interaction table (global, RLS-open-read), and
// no migration/seed script anywhere in the repo ever inserts rows into it.
// So this list isn't a subset of something bigger online — it's authored
// here directly, scoped to well-established interactions among the drugs in
// keml-catalog.ts (this build's own product universe). Severity uses
// "severe"/"moderate"/"mild" (packages/core/src/dur.ts's DurWarning.severity
// union) rather than the online schema's CHECK-constrained
// contraindicated/major/moderate/minor vocabulary — deliberately: the online
// app's own dur.ts casts a raw DB severity straight into that union without
// ever mapping "major"->"severe", so a real online interaction row could
// never trip the "severe, requires confirmation" gate in
// apps/web/app/api/prescriptions/route.ts. Reusing mobile's already-working
// severe/moderate/mild vocabulary avoids inheriting that bug.
//
// Not a substitute for a pharmacist's own clinical judgement or a licensed
// interaction-checker database — this is a starter safety net, still a
// known, tracked scope limit (see the offline-edition-plan memory).

export interface DurInteractionSeedRow {
  a: string
  b: string
  severity: "severe" | "moderate" | "mild"
  note: string
}

export const DUR_INTERACTIONS: DurInteractionSeedRow[] = [
  // Warfarin — most anticoagulant interactions are severe (bleeding risk)
  { a: "warfarin", b: "aspirin", severity: "severe", note: "Increased bleeding risk" },
  { a: "warfarin", b: "ibuprofen", severity: "severe", note: "Increased bleeding risk" },
  { a: "warfarin", b: "diclofenac", severity: "severe", note: "Increased bleeding risk" },
  { a: "warfarin", b: "cotrimoxazole", severity: "severe", note: "Enhanced anticoagulant effect, bleeding risk" },
  { a: "warfarin", b: "metronidazole", severity: "severe", note: "Enhanced anticoagulant effect, bleeding risk" },
  { a: "warfarin", b: "fluconazole", severity: "severe", note: "Enhanced anticoagulant effect, bleeding risk" },
  { a: "warfarin", b: "ciprofloxacin", severity: "moderate", note: "Enhanced anticoagulant effect" },
  { a: "warfarin", b: "erythromycin", severity: "moderate", note: "Enhanced anticoagulant effect" },
  { a: "warfarin", b: "doxycycline", severity: "moderate", note: "Enhanced anticoagulant effect" },
  { a: "warfarin", b: "phenobarbital", severity: "moderate", note: "Reduced anticoagulant effect (enzyme induction)" },
  // Antidiabetics
  { a: "metformin", b: "alcohol", severity: "moderate", note: "Risk of lactic acidosis" },
  { a: "glibenclamide", b: "fluconazole", severity: "moderate", note: "Enhanced hypoglycaemic effect" },
  { a: "glibenclamide", b: "cotrimoxazole", severity: "moderate", note: "Enhanced hypoglycaemic effect" },
  { a: "glimepiride", b: "fluconazole", severity: "moderate", note: "Enhanced hypoglycaemic effect" },
  { a: "quinine", b: "metformin", severity: "moderate", note: "Additive hypoglycaemic effect" },
  { a: "quinine", b: "glibenclamide", severity: "moderate", note: "Additive hypoglycaemic effect" },
  // ACE inhibitors / ARBs / potassium
  { a: "enalapril", b: "potassium", severity: "moderate", note: "Risk of hyperkalaemia" },
  { a: "lisinopril", b: "potassium", severity: "moderate", note: "Risk of hyperkalaemia" },
  { a: "losartan", b: "potassium", severity: "moderate", note: "Risk of hyperkalaemia" },
  { a: "enalapril", b: "ibuprofen", severity: "moderate", note: "Reduced antihypertensive effect, renal impairment risk" },
  { a: "lisinopril", b: "ibuprofen", severity: "moderate", note: "Reduced antihypertensive effect, renal impairment risk" },
  { a: "enalapril", b: "diclofenac", severity: "moderate", note: "Reduced antihypertensive effect, renal impairment risk" },
  { a: "furosemide", b: "ibuprofen", severity: "moderate", note: "Reduced diuretic effect" },
  { a: "furosemide", b: "diclofenac", severity: "moderate", note: "Reduced diuretic effect" },
  // Statins
  { a: "simvastatin", b: "erythromycin", severity: "severe", note: "Increased myopathy/rhabdomyolysis risk" },
  { a: "atorvastatin", b: "erythromycin", severity: "moderate", note: "Increased myopathy risk" },
  { a: "atorvastatin", b: "azithromycin", severity: "mild", note: "Slightly increased statin exposure" },
  { a: "simvastatin", b: "azithromycin", severity: "mild", note: "Slightly increased statin exposure" },
  // Methotrexate-class (not in the local catalogue, kept as a classic safety-net pair)
  { a: "methotrexate", b: "trimethoprim", severity: "severe", note: "Increased methotrexate toxicity" },
  { a: "methotrexate", b: "cotrimoxazole", severity: "severe", note: "Increased methotrexate toxicity" },
  { a: "methotrexate", b: "ibuprofen", severity: "moderate", note: "Reduced methotrexate clearance" },
  // CNS depressants
  { a: "diazepam", b: "tramadol", severity: "severe", note: "Additive CNS/respiratory depression" },
  { a: "diazepam", b: "phenobarbital", severity: "severe", note: "Additive CNS/respiratory depression" },
  { a: "diazepam", b: "amitriptyline", severity: "moderate", note: "Additive CNS depression" },
  { a: "tramadol", b: "amitriptyline", severity: "severe", note: "Serotonin syndrome risk" },
  { a: "promethazine", b: "diazepam", severity: "moderate", note: "Additive sedation" },
  { a: "metoclopramide", b: "amitriptyline", severity: "mild", note: "Increased extrapyramidal symptom risk" },
  // Antibiotic absorption interactions
  { a: "doxycycline", b: "calcium", severity: "moderate", note: "Reduced antibiotic absorption — separate dosing by 2+ hours" },
  { a: "doxycycline", b: "ferrous sulphate", severity: "moderate", note: "Reduced antibiotic absorption — separate dosing by 2+ hours" },
  { a: "ciprofloxacin", b: "ferrous sulphate", severity: "moderate", note: "Reduced antibiotic absorption — separate dosing by 2+ hours" },
  { a: "ciprofloxacin", b: "calcium", severity: "moderate", note: "Reduced antibiotic absorption — separate dosing by 2+ hours" },
  { a: "ciprofloxacin", b: "magnesium trisilicate", severity: "moderate", note: "Antacid reduces antibiotic absorption — separate dosing by 2+ hours" },
  // NSAID + NSAID / steroid GI risk
  { a: "aspirin", b: "ibuprofen", severity: "moderate", note: "Reduced cardioprotective effect of aspirin, additive GI risk" },
  { a: "aspirin", b: "diclofenac", severity: "moderate", note: "Additive GI bleeding risk" },
  { a: "prednisolone", b: "ibuprofen", severity: "moderate", note: "Increased GI ulceration/bleeding risk" },
  { a: "prednisolone", b: "diclofenac", severity: "moderate", note: "Increased GI ulceration/bleeding risk" },
  { a: "prednisolone", b: "aspirin", severity: "moderate", note: "Increased GI ulceration/bleeding risk" },
]
