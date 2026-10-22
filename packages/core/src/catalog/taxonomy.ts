// PharmaTrack's default product categories (20 departments, ~120
// subcategories, in the words customers and pharmacists use) and the rules
// that place a product in one. Used to:
//   - categorise the shared drug catalogue (packages/db/scripts/gen-catalog-categories.ts → migration 037)
//   - suggest a category while someone adds a product (web + Android)
// A pharmacy's own categories are never changed: a default is only created in
// its category table the first time a product uses it (category_key on POST/PATCH
// /api/products → apps/web/lib/catalog/defaultCategory.ts),
// and linked by `default_key` so a later rename keeps suggestions landing there.
import { BRAND_ALIASES, DEFAULT_TAXONOMY, MOLECULE_RULES, NAME_RULES, type TaxonomyCategory } from "./taxonomyRules"

export { DEFAULT_TAXONOMY, type TaxonomyCategory } from "./taxonomyRules"

export interface CategorySuggestion {
  category: TaxonomyCategory
  subcategory: string
  /** "likely" = safe to pre-fill (form, molecule or catalogue); "maybe" = offer, don't apply. */
  confidence: "likely" | "maybe"
  /** Short, human reason: "amoxicillin", "eye drops", "name". */
  reason: string
}

/** Stable id of a default subcategory, e.g. "pain-fever/gout". */
export function taxonomyKey(category: string, subcategory?: string | null): string {
  const slug = (s: string) => s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return subcategory ? `${slug(category)}/${slug(subcategory)}` : slug(category)
}

/** Every default (category, subcategory) pair, in display order. */
export function taxonomyEntries(): Array<{ category: TaxonomyCategory; subcategory: string; key: string }> {
  return (Object.entries(DEFAULT_TAXONOMY) as Array<[TaxonomyCategory, readonly string[]]>).flatMap(([category, subs]) =>
    subs.map((subcategory) => ({ category, subcategory, key: taxonomyKey(category, subcategory) })),
  )
}

/** Is this a real default pair? (Guards keys coming back from clients.) */
export function findTaxonomyEntry(key: string) {
  return taxonomyEntries().find((e) => e.key === key) ?? null
}

const has = (text: string, words: readonly string[]) => words.some((w) => text.includes(w))

/** rapidfuzz-style ratio: 100 × 2·LCS / (|a| + |b|). */
function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  let prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, cur[j - 1] ?? 0)
    }
    prev = cur
  }
  return (200 * (prev[b.length] ?? 0)) / (a.length + b.length)
}

const EYE = ["eye", "ophthalm"]
const VAGINAL = ["vaginal", "pessar", "intrauterine"]
const INHAL = ["inhal", "nebul", "respirator"]
const RECTAL = ["rectal", "suppositor"]
const TOPICAL = ["cream", "ointment", " gel", "lotion", "topical", "cutaneous", "shampoo", "foam", "dusting powder", "medicated plaster", "skin", "scalp"]
const INJ = ["inject", "infus", "pre-filled", "implant"]

type Hit = [TaxonomyCategory, string, string]

/** The molecule of a known Kenyan brand at the start of a name ("Amoxil 500mg" → "amoxicillin"), else null. */
export function brandMolecule(name: string): string | null {
  const words = name.toLowerCase().trim().split(/[^a-z0-9]+/)
  return BRAND_ALIASES[`${words[0]} ${words[1] ?? ""}`.trim()] ?? BRAND_ALIASES[words[0] ?? ""] ?? null
}

/** Departments whose medicines are prescription-only by default (POM) when nothing else says. */
export const PRESCRIPTION_DEPARTMENTS: readonly TaxonomyCategory[] = [
  "Antibiotics & Infections", "Heart & Blood Pressure", "Diabetes & Hormones", "Brain & Mental Health", "Men's Health & Urology", "Hospital & Specialist",
]

/** Products whose dosage form decides the shelf (eye, ear, skin, inhaled, vaginal…). */
function byForm(n: string, f: string, mol: (w: readonly string[]) => boolean): Hit | null {
  if (has(f, EYE) || has(n, [" eye drop", " eyedrop", " eye oint", " ophthalmic"])) {
    if (mol(["timolol", "latanoprost", "brimonidine", "dorzolamide", "travoprost", "bimatoprost", "brinzolamide", "pilocarpine", "tafluprost"])) return ["Eye & Ear Care", "Glaucoma", "eye drops"]
    if (mol(["carmellose", "carboxymethylcellulose", "hypromellose", "hyaluron", "polyethylene glycol", "propylene glycol", "artificial tear", "dextran", "povidone", "liquid paraffin", "carbomer"])) return ["Eye & Ear Care", "Dry eyes", "eye drops"]
    if (mol(["cin", "floxacin", "chloramphenicol", "fusidic", "polymyxin", "neomycin", "sulfacetamide", "aciclovir", "acyclovir", "ganciclovir", "natamycin"])) return ["Eye & Ear Care", "Eye infections", "eye drops"]
    return ["Eye & Ear Care", "Eye allergy & inflammation", "eye drops"]
  }
  if (has(f, [" ear ", "ear/eye", "otic", "auricular"]) || has(n, [" ear drop"])) return ["Eye & Ear Care", "Ear drops", "ear drops"]
  if (has(f, VAGINAL)) {
    if (mol(["levonorgestrel", "etonogestrel"])) return ["Women's Health", "Injectables & implants", "implant"]
    return ["Women's Health", "Vaginal care & infections", "vaginal"]
  }
  if (has(f, RECTAL) && !mol(["paracetamol", "diclofenac", "ibuprofen", "artesunate", "bisacodyl", "glycerin", "indomethacin"])) {
    return ["Stomach & Digestion", "Haemorrhoids", "rectal"]
  }
  if (has(f, INHAL) || has(n, ["inhaler", "evohaler", "accuhaler", "turbuhaler", "respules", "nebul"])) return ["Asthma & Respiratory", "Inhalers & nebules", "inhaler"]
  if (has(f, ["nasal"]) || has(n, ["nasal"])) return ["Cough, Cold & Allergy", "Nasal sprays & drops", "nasal"]
  if (has(f, ["mouthwash", "oromucosal", "dental", "gingival", "oral gel", "lozenge", "pastille"]) && !f.includes("tablet")) {
    if (has(f, ["lozenge", "pastille"])) return ["Cough, Cold & Allergy", "Sore throat & lozenges", "lozenge"]
    return ["Mouth & Dental", "Mouth ulcers & thrush", "mouth"]
  }
  if (has(f, TOPICAL) && !f.includes("transdermal")) {
    if (mol(["permethrin", "benzyl benzoate", "crotamiton", "malathion"])) return ["Malaria & Parasites", "Scabies & lice", "scabies"]
    if (mol(["diclofenac", "ketoprofen", "piroxicam", "ibuprofen", "methyl salicylate", "menthol", "capsaicin", "etofenamate", "aceclofenac", "camphor", "thiocolchicoside", "nimesulide", "indomethacin", "felbinac", "naproxen", "etoricoxib"])) return ["Pain & Fever", "Pain rubs & gels", "pain gel"]
    if (mol(["benzoyl", "adapalene", "tretinoin", "isotretinoin", "azelaic", "clindamycin", "salicylic acid 2", "nicotinamide gel", "dapsone"])) return ["Skin Care", "Acne care", "acne"]
    if (mol(["aciclovir", "acyclovir", "penciclovir", "docosanol"])) return ["Skin Care", "Cold sores & viral", "antiviral cream"]
    if (mol(["minoxidil", "ketoconazole shampoo", "selenium", "coal tar", "zinc pyrithione"]) || f.includes("shampoo")) return ["Skin Care", "Hair & scalp", "scalp"]
    if (mol(["clotrimazole", "miconazole", "ketoconazole", "terbinafine", "luliconazole", "sertaconazole", "econazole", "tioconazole", "nystatin", "whitfield", "tolnaftate", "amorolfine", "butenafine", "eberconazole", "oxiconazole", "ciclopirox", "fenticonazole"])) return ["Skin Care", "Antifungal creams", "antifungal"]
    if (mol(["fusidic", "mupirocin", "neomycin", "gentamicin", "silver sulfadiazine", "sulfadiazine", "framycetin", "bacitracin", "nitrofural", "retapamulin", "ozenoxacin", "chlortetracycline"])) return ["Skin Care", "Antibacterial creams", "antibacterial"]
    if (mol(["betamethasone", "clobetasol", "hydrocortisone", "mometasone", "fluocinolone", "fluticasone", "triamcinolone", "desonide", "beclomet", "halobetasol", "fluocinonide", "clobetasone", "prednicarbate", "methylprednisolone aceponate"])) return ["Skin Care", "Steroid creams", "steroid"]
    if (mol(["urea", "emollient", "paraffin", "glycerol", "calamine", "aqueous cream", "lanolin", "dimeticone", "colloidal oat", "tacrolimus", "pimecrolimus", "crisaborole"])) return ["Skin Care", "Eczema & dry skin", "emollient"]
    if (mol(["povidone", "chlorhexidine", "hydrogen peroxide", "cetrimide", "silver"])) return ["First Aid & Medical Devices", "Antiseptics & disinfectants", "antiseptic"]
    return ["Skin Care", "Medicated skin care", "skin"]
  }
  return null
}

/**
 * The most likely default category for a product, from whatever is known:
 * its name, generic (molecule) and dosage form. Null when nothing fits —
 * callers leave the product uncategorised rather than guess.
 */
export function suggestCategory(input: { name?: string | null; generic?: string | null; dosageForm?: string | null }): CategorySuggestion | null {
  const n = ` ${(input.name ?? "").toLowerCase()} `
  const g = ` ${(input.generic ?? "").toLowerCase()} `
  const f = ` ${(input.dosageForm ?? "").toLowerCase()} `
  if (!n.trim() && !g.trim()) return null
  // A known brand at the start of the name contributes its molecule.
  const brand = brandMolecule(n) ?? ""
  const text = `${g} ${n} ${brand} `
  const mol = (words: readonly string[]) => has(text, words)
  const out = (h: Hit, confidence: CategorySuggestion["confidence"]): CategorySuggestion => ({ category: h[0], subcategory: h[1], confidence, reason: h[2] })

  const form = byForm(n, f, mol)
  if (form) return out(form, "likely")

  for (const [category, subcategory, words] of MOLECULE_RULES) {
    const w = words.find((k) => text.includes(k))
    if (w) return out([category, subcategory, w.trim()], "likely")
  }
  // Misspelt molecules ("cetrizine", "albenzadole").
  const tokens = [...new Set(text.match(/[a-z]{6,}/g) ?? [])]
  if (tokens.length) {
    for (const [category, subcategory, words] of MOLECULE_RULES) {
      for (const kw of words) {
        if (kw.length >= 7 && !kw.includes(" ") && tokens.some((t) => similarity(t, kw) >= 86)) return out([category, subcategory, kw], "maybe")
      }
    }
  }
  for (const [category, subcategory, keywords] of NAME_RULES) {
    const w = keywords.find((k) => text.includes(k))
    if (w) return out([category, subcategory, w.trim()], "maybe")
  }
  if (has(f, INJ)) return out(["Hospital & Specialist", "Other injectables", "injection"], "maybe")
  return null
}
