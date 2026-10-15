#!/usr/bin/env python3
"""Turn the PPB register CSV (scripts/fetch_ppb_register.py) into a dbmate
migration that loads it into the shared drug_catalog as source='ppb' rows.

What it derives from each register row:
  name / brand_name   trade name, minus strength and dosage-form words, tidied case
  strength            "500mg", "0.25mg/5ml", "5mg+10mg" — from the trade name, else the INN text
  generic_name        INN without pharmacopoeia tags / forms / strengths, lowercase,
                      components joined with " + " (matches the curated rows)
  dosage_form/base_unit  the register's 138 forms folded into the app's vocabulary
  is_controlled       any component on the Kenyan narcotic/psychotropic list
  requires_prescription / is_otc   OTC only when every component is on the OTC list
  category            by molecule keyword (falls back on the form), using the
                      curated departments plus a few PPB-only ones
No prices: these rows are for search + autofill; staff price each product.
Curated rows win on (name, strength, dosage_form) clashes (ON CONFLICT DO NOTHING).

Usage: python3 scripts/gen_ppb_catalog_sql.py [CSV] [OUT_SQL]
Stdlib only. Re-running on the same CSV produces the same file.
"""
from __future__ import annotations

import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "..", "packages", "db", "data", "ppb", "retained-products.csv")
OUT_PATH = os.path.join(HERE, "..", "infra", "migrations", "035_drug_catalog_ppb_data.sql")

UNIT = r"(?:mcg|µg|mg|g|ml|iu|%(?:\s*w/[vw])?|units?|mmol|mu)"
NUM = r"\d+(?:\.\d+)?"
# 500mg · 12.5/500mg · 0.25 mg/5 ml · 30mg/ml · 5mg+10mg · 10 mg/100 mg/500 mg · 1%
STRENGTH_RE = re.compile(
    rf"(?<![\w.])((?:{NUM}\s*/\s*)*{NUM}\s*{UNIT}(?:\s*[/+]\s*(?:{NUM}\s*)?{UNIT}?)*)(?![A-Za-z])", re.I,
)
PHARMACOPOEIA_RE = re.compile(r"\b(?:USP|BP|IP|EP|JP|Ph\s*\.?\s*Eur|INN|IHS|IH)\b\.?|(?<=[a-z])USP\b", re.I)
# Words that describe the form rather than the product (stripped from names/INNs).
FORM_WORDS_RE = re.compile(
    r"\b(?:film[- ]?coated|coated|chewable|dispersible|effervescent|sustained[- ]release|prolonged[- ]release|"
    r"extended[- ]release|modified[- ]release|gastro[- ]resistant|orally disintegrating|"
    r"for (?:oral )?(?:suspension|solution|injection|infusion)|solution for (?:injection|infusion)|"
    r"oral (?:suspension|solution|drops)|eye drops|ear drops|solution for|"
    r"tablets?|tabs?|capsules?|caps|injections?|inj|infusion|syrup|suspension|"
    r"cream|ointment|gel|drops|sachets?|powder)\b\.?",
    re.I,
)

CONTROLLED = [
    "morphine", "pethidine", "meperidine", "fentanyl", "remifentanil", "sufentanil", "alfentanil", "codeine",
    "tramadol", "tapentadol", "oxycodone", "hydromorphone", "methadone", "buprenorphine",
    "pentazocine", "nalbuphine", "ketamine", "diazepam", "lorazepam", "alprazolam", "midazolam", "clonazepam",
    "bromazepam", "chlordiazepoxide", "nitrazepam", "temazepam", "clobazam", "phenobarbit",
    "thiopental", "methylphenidate", "zolpidem",
]

# OTC in Kenyan retail practice. A product is OTC only if EVERY component is here.
OTC = [
    "paracetamol", "acetaminophen", "ibuprofen", "aspirin", "acetylsalicylic", "cetirizine", "loratadine",
    "desloratadine", "fexofenadine", "chlorphenamine", "chlorpheniramine", "simeticone", "simethicone",
    "magnesium", "aluminium", "aluminum", "calcium carbonate", "sodium bicarbonate", "alginate",
    "loperamide", "oral rehydration", "zinc", "vitamin", "ascorbic", "thiamine", "pyridoxine", "riboflavin",
    "nicotinamide", "cyanocobalamin", "cholecalciferol", "folic", "ferrous", "iron", "calcium", "multivitamin",
    "clotrimazole", "miconazole", "xylometazoline", "oxymetazoline", "guaifenesin", "guaiphenesin", "bromhexine",
    "ambroxol", "dextromethorphan", "carbocisteine", "albendazole", "mebendazole", "permethrin", "povidone",
    "chlorhexidine", "salicylic", "benzoyl", "lactulose", "bisacodyl", "senna", "glycerin", "glycerol",
    "elemental iron", "menthol", "camphor", "sodium chloride", "potassium chloride", "glucose", "dextrose", "omega", "cod liver",
]

# Words that may follow an OTC molecule without changing what it is.
SALT_WORDS = set("""hydrochloride hcl dihydrochloride hydrobromide hbr maleate sodium potassium calcium magnesium
    monohydrate dihydrate trihydrate hemihydrate anhydrous acid oxide hydroxide carbonate gluconate lactate fumarate
    sulfate sulphate nitrate trisilicate citrate phosphate acetate polymaltose complex iii ii elemental palmitate
    mononitrate peroxide emulsion concentrate""".split())


def otc_component(c: str) -> bool:
    """'cetirizine dihydrochloride' yes; 'paracetamol diclofenac potassium' no (two molecules, no separator)."""
    head = next((w for w in OTC if c.startswith(w)), None)
    if head is None:
        return False
    rest = c[len(head):].replace("-", " ").split()
    return all(w in SALT_WORDS or re.fullmatch(r"[a-z]?\d*[a-z]?", w) for w in rest)


# (category, molecule keywords). First match wins; order matters.
CATEGORIES: list[tuple[str, list[str]]] = [
    ("Contraceptives", ["levonorgestrel", "ethinylestradiol", "ethinyl estradiol", "medroxyprogesterone", "etonogestrel",
                        "desogestrel", "norethisterone", "drospirenone", "ulipristal", "norgestrel", "dienogest"]),
    ("Antiparasitics", ["artemether", "lumefantrine", "artesunate", "quinine", "dihydroartemisinin", "piperaquine",
                        "atovaquone", "proguanil", "albendazole", "mebendazole", "praziquantel", "ivermectin",
                        "primaquine", "sulfadoxine", "pyrimethamine", "amodiaquine", "tinidazole", "secnidazole",
                        "nitazoxanide", "pyronaridine", "levamisole", "permethrin", "chloroquine"]),
    ("Antivirals & HIV", ["vir ", "virine", "lamivudine", "zidovudine", "tenofovir", "efavirenz", "nevirapine",
                          "abacavir", "emtricitabine", "rilpivirine", "oseltamivir", "acyclovir", "aciclovir",
                          "valacyclovir", "valaciclovir", "ribavirin", "cabotegravir", "entecavir"]),
    ("Cancer & Immunology", ["mab ", "tinib", "platin", "taxel", "rubicin", "cyclophosphamide", "methotrexate",
                             "capecitabine", "gemcitabine", "fluorouracil", "letrozole", "anastrozole", "exemestane",
                             "tamoxifen", "bicalutamide", "lenalidomide", "pomalidomide", "thalidomide", "bortezomib",
                             "pemetrexed", "temozolomide", "abiraterone", "enzalutamide", "tacrolimus",
                             "mycophenolate", "ciclosporin", "cyclosporine", "azathioprine", "hydroxyurea",
                             "hydroxycarbamide", "leuprorelin", "leuprolide", "goserelin", "etoposide", "vincristine",
                             "vinorelbine", "irinotecan", "bendamustine", "fulvestrant", "decitabine",
                             "azacitidine", "cytarabine", "ifosfamide", "everolimus", "filgrastim",
                             "epoetin", "erythropoietin", "interferon"]),
    ("Antibiotics & Antifungals", ["cillin", "cef", "ceph", "penem", "mycin", "micin", "floxacin", "cycline",
                                   "sulfamethoxazole", "trimethoprim", "cotrimoxazole", "nitrofurantoin", "linezolid",
                                   "metronidazole", "clavulan", "sulbactam", "tazobactam", "colistin", "fosfomycin",
                                   "fluconazole", "itraconazole", "ketoconazole", "voriconazole", "posaconazole",
                                   "terbinafine", "nystatin", "griseofulvin", "amphotericin", "isoniazid",
                                   "rifampicin", "rifampin", "ethambutol", "pyrazinamide", "fusidic", "mupirocin",
                                   "clotrimazole", "miconazole", "luliconazole", "sertaconazole", "caspofungin",
                                   "micafungin", "aztreonam", "bedaquiline", "delamanid"]),
    ("Psychiatric Medications", ["diazepam", "lorazepam", "alprazolam", "clonazepam", "midazolam", "bromazepam",
                                 "clobazam", "olanzapine", "risperidone", "quetiapine", "aripiprazole", "haloperidol",
                                 "chlorpromazine", "fluphenazine", "flupentixol", "clozapine", "paliperidone",
                                 "lurasidone", "fluoxetine", "sertraline", "escitalopram", "citalopram", "paroxetine",
                                 "fluvoxamine", "amitriptyline", "imipramine", "clomipramine", "nortriptyline",
                                 "mirtazapine", "venlafaxine", "duloxetine", "vortioxetine",
                                 "bupropion", "trazodone", "agomelatine", "carbamazepine", "valpro", "lamotrigine",
                                 "levetiracetam", "brivaracetam", "phenytoin", "phenobarbit", "topiramate",
                                 "lacosamide", "oxcarbazepine", "eslicarbazepine", "pregabalin", "gabapentin",
                                 "lithium", "zolpidem", "methylphenidate", "atomoxetine", "donepezil", "memantine",
                                 "rivastigmine", "trihexyphenidyl", "benzhexol", "levodopa", "carbidopa",
                                 "pramipexole", "ropinirole", "buspirone", "perampanel", "zonisamide", "sulpiride",
                                 "amisulpride", "ziprasidone", "cariprazine", "tetrabenazine"]),
    ("Respiratory", ["montelukast", "salbutamol", "albuterol", "budesonide", "fluticasone",
                     "formoterol", "salmeterol", "tiotropium", "ipratropium", "glycopyrronium", "umeclidinium",
                     "vilanterol", "indacaterol", "theophylline", "doxofylline", "aminophylline", "beclomet",
                     "terbutaline", "roflumilast", "ciclesonide"]),
    ("Cough & Cold", ["cetirizine", "loratadine", "fexofenadine", "chlorphenamine", "chlorpheniramine",
                      "promethazine", "diphenhydramine", "bilastine", "rupatadine", "ebastine", "pseudoephedrine",
                      "phenylephrine", "guaifenesin", "guaiphenesin", "bromhexine", "ambroxol", "dextromethorphan",
                      "carbocisteine", "acetylcysteine", "xylometazoline", "oxymetazoline", "cyproheptadine",
                      "pholcodine", "hydroxyzine", "ketotifen"]),
    ("Pain & Anti-inflammatory", ["paracetamol", "acetaminophen", "ibuprofen", "diclofenac",
                                  "aceclofenac", "etoricoxib", "celecoxib", "naproxen", "meloxicam", "piroxicam",
                                  "lornoxicam", "ketorolac", "ketoprofen", "mefenamic",
                                  "indometacin", "indomethacin", "nimesulide", "aspirin", "acetylsalicylic",
                                  "morphine", "pethidine", "fentanyl", "codeine", "tramadol", "tapentadol",
                                  "oxycodone", "buprenorphine", "pentazocine", "colchicine", "febuxostat",
                                  "allopurinol", "methocarbamol", "chlorzoxazone", "orphenadrine", "thiocolchicoside",
                                  "tizanidine", "baclofen", "glucosamine", "sumatriptan", "rizatriptan",
                                  "lidocaine", "lignocaine", "bupivacaine", "ropivacaine", "prednisolone",
                                  "dexamethasone", "hydrocortisone", "betamethasone",
                                  "triamcinolone", "deflazacort"]),
    ("Antacids & GI", ["prazole", "ranitidine", "famotidine", "cimetidine", "domperidone", "ondansetron",
                       "granisetron", "palonosetron", "metoclopramide", "loperamide", "hyoscine", "butylscopolamine",
                       "simeticone", "simethicone", "lactulose", "bisacodyl", "mebeverine", "drotaverine",
                       "ursodeoxycholic", "mesalazine", "sulfasalazine", "sucralfate", "magnesium hydroxide",
                       "aluminium", "alginate", "oral rehydration", "itopride", "rifaximin", "senna", "picosulfate",
                       "dicyclomine", "dicycloverine", "trimebutine", "prucalopride", "macrogol",
                       "racecadotril", "pancreatin", "otilonium", "aprepitant", "levosulpiride", "bismuth"]),
    ("Cardiovascular & Metabolic", ["sartan", "pril", "olol", "dipine", "statin", "metformin", "gliptin", "gliflozin",
                                    "glimepiride", "gliclazide", "glibenclamide", "glipizide", "insulin", "glutide",
                                    "tirzepatide", "pioglitazone", "acarbose", "voglibose", "thiazide",
                                    "chlortalidone", "chlorthalidone", "furosemide", "frusemide", "torasemide",
                                    "torsemide", "spironolactone", "eplerenone", "indapamide", "amiloride",
                                    "clopidogrel", "prasugrel", "ticagrelor", "rivaroxaban", "apixaban", "edoxaban",
                                    "dabigatran", "warfarin", "acenocoumarol", "heparin", "enoxaparin",
                                    "fondaparinux", "digoxin", "amiodarone", "nitroglycerin", "glyceryl trinitrate",
                                    "isosorbide", "trimetazidine", "ivabradine", "sacubitril", "ezetimibe",
                                    "fenofibrate", "gemfibrozil", "levothyroxine", "thyroxine", "carbimazole",
                                    "methimazole", "propylthiouracil", "ranolazine", "hydralazine", "methyldopa",
                                    "prazosin", "verapamil", "diltiazem", "cilostazol", "pentoxifylline",
                                    "tranexamic", "nicorandil", "bempedoic"]),
    ("Urology & Men's Health", ["tamsulosin", "alfuzosin", "silodosin", "doxazosin", "terazosin", "dutasteride",
                                "finasteride", "sildenafil", "tadalafil", "vardenafil", "solifenacin", "tolterodine",
                                "oxybutynin", "mirabegron", "flavoxate", "dapoxetine"]),
    ("Hormones", ["estradiol", "oestradiol", "progesterone", "dydrogesterone", "testosterone", "clomifene",
                  "clomiphene", "cabergoline", "bromocriptine", "oxytocin", "carbetocin",
                  "misoprostol", "dinoprostone", "somatropin", "desmopressin", "octreotide", "alendron", "risedron",
                  "ibandron", "zoledron", "denosumab", "teriparatide", "calcitonin", "raloxifene", "tibolone"]),
    ("Vitamins & Supplements", ["vitamin", "folic", "ferrous", "iron", "ferric", "calcium", "cholecalciferol",
                                "calcitriol", "alfacalcidol", "cyanocobalamin", "methylcobalamin", "mecobalamin",
                                "multivitamin", "zinc", "ascorbic", "thiamine", "pyridoxine", "riboflavin",
                                "nicotinamide", "magnesium", "omega", "selenium", "biotin", "carnitine",
                                "coenzyme", "lycopene", "potassium chloride", "electrolyte"]),
]

EYE_EAR = ["eye", "ear", "ophthalmic", "otic"]
TOPICAL = ["cream", "ointment", "gel", "cutaneous", "topical", "shampoo", "lotion"]


def clean_space(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip(" ,;:-–.·/+&")


def norm_strength(s: str) -> str:
    s = re.sub(r"\s+", "", s).lower()
    s = s.replace("µg", "mcg").replace("iu", "IU")
    s = re.sub(r"(?<![a-z])mu(?![a-z])", "MU", s)
    s = re.sub(r"%w/([vw])", r"% w/\1", s)
    return s.rstrip("/+")


def find_strength(text: str) -> tuple[str | None, str]:
    """(strength, text with it removed). Picks the first explicit-unit strength."""
    m = STRENGTH_RE.search(text)
    if not m:
        return None, text
    return norm_strength(m.group(1)), text[: m.start()] + " " + text[m.end():]


def smart_case(s: str) -> str:
    """Tidy SHOUTED trade names: 'TELMICLAR HTZ' -> 'Telmiclar HTZ'. Mixed case is kept."""
    if s != s.upper():
        return s

    def seg(p: str) -> str:
        letters = re.sub(r"[^A-Za-z]", "", p)
        if not letters or any(ch.isdigit() for ch in p) or len(letters) <= 3:
            return p  # HTZ, DS, SR, 800SR, M
        return p[0] + p[1:].lower() if p[0].isalpha() else p.lower()

    return " ".join("-".join(seg(p) for p in w.split("-")) for w in s.split(" "))


def clean_name(trade: str) -> tuple[str, str | None]:
    t = re.sub(r"[…®™]", " ", trade)
    t = re.sub(r"\([^)]*(?:\)|$)", " ", t)  # "(Etoricoxib 60 mg)", or one the register cut off
    strength, t = find_strength(t)
    t = PHARMACOPOEIA_RE.sub(" ", t)
    t = FORM_WORDS_RE.sub(" ", t)
    t = re.sub(r"(?<=\w)\s*-\s*(?=\d)", "-", t)  # "Itacon - 100" -> "Itacon-100"
    t = re.sub(r"\s+(?:for|in)\s*$", "", clean_space(t), flags=re.I)
    return smart_case(clean_space(t)), strength


def components(inn: str) -> list[str]:
    t = inn.split("…")[0]
    t = re.sub(r"\([^)]*\)", " ", t)
    # A strength also separates molecules: "Tramadol 37.5mg Paracetamol 325mg".
    t = STRENGTH_RE.sub(" + ", t)
    t = PHARMACOPOEIA_RE.sub(" ", t)
    t = FORM_WORDS_RE.sub(" ", t)
    t = re.sub(r"\b(?:for|oral|ophthalmic|topical|nasal|spray|eye|ear|w/v|w/w|sterile|and water)\b", " ", t, flags=re.I)
    parts = re.split(r"\s*(?:\+|&|,|/|;|\band\b|\bwith\b)\s*", t, flags=re.I)
    seen: list[str] = []
    for p in (re.sub(r"\s+(?:as|in|eq\.?|equivalent to)\s.*$", "", clean_space(x), flags=re.I).lower() for x in parts):
        if len(p) > 1 and p not in seen:
            seen.append(p)
    return seen


def has_any(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


def map_form(raw: str) -> tuple[str, str]:
    """PPB dosage form -> (app dosage_form, base_unit)."""
    f = raw.lower()
    if "intrauterine" in f:
        return "Device", "piece"
    if "implant" in f:
        return "Implant", "piece"
    if "patch" in f:
        return "Patch", "piece"
    if "transdermal" in f or "vaginal gel" in f:
        return "Gel", "tube"
    if has_any(f, ["eye", "ear", "ophthalmic"]) and "ointment" in f:
        return "Ointment", "tube"
    if has_any(f, ["eye", "ear", "ophthalmic", "nasal drops"]):
        return ("Gel", "tube") if "gel" in f else ("Drops", "bottle")
    if "spray" in f:
        return "Spray", "bottle"
    if "nebuliser" in f:
        return "Solution", "ampoule"
    if "inhalation vapour" in f:
        return "Solution", "bottle"
    if "inhal" in f or "pressurised" in f:
        return "Inhaler", "can"
    if ("vaginal" in f and has_any(f, ["tablet", "capsule"])) or "pessary" in f:
        return "Pessary", "piece"
    if "rectal" in f or "suppositor" in f:
        return "Suppository", "piece"
    if "enema" in f:
        return "Enema", "bottle"
    if has_any(f, ["inject", "infus", "parenteral", "pre-filled", "cartridge", "vaccine", "sterile concentrate", "frozen"]):
        if f in ("infusion", "solution for infusion", "emulsion for infusion"):
            return "Infusion", "bottle"
        return "Injection", "vial"
    if "lozenge" in f:
        return "Lozenge", "lozenge"
    if "sachet" in f:
        return "Sachet", "sachet"
    if "tablet" in f or "lyophilisate" in f or "strip" in f:
        return "Tablet", "tablet"
    if "capsule" in f:
        return "Capsule", "capsule"
    for word, form, unit in (("cream", "Cream", "tube"), ("ointment", "Ointment", "tube"), ("gel", "Gel", "tube"),
                             ("shampoo", "Shampoo", "bottle"), ("mouthwash", "Mouthwash", "bottle"),
                             ("gargle", "Mouthwash", "bottle"), ("cutaneous powder", "Powder", "bottle")):
        if word in f:
            return form, unit
    if has_any(f, ["cutaneous", "topical"]):
        return "Lotion", "bottle"
    if "syrup" in f:
        return "Syrup", "bottle"
    if "suspension" in f:
        return "Suspension", "bottle"
    if "oral drops" in f:
        return "Drops", "bottle"
    if "granules" in f or "oral powder" in f:
        return "Sachet", "sachet"
    if "solution" in f or "liquid" in f:
        return "Solution", "bottle"
    return raw.strip().title(), "piece"


def categorise(raw_form: str, generic: str) -> str:
    f = raw_form.lower()
    g = f" {generic} "
    if has_any(f, EYE_EAR):
        return "Eye & Ear Drops"
    if has_any(f, TOPICAL) and "transdermal" not in f:
        return "Topicals"
    for cat, words in CATEGORIES:
        if has_any(g, words):
            return cat
    if has_any(f, ["inject", "infus"]):
        return "Injections & Misc"
    return "Misc"


def sql_str(v: object) -> str:
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def build(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    out: dict[tuple[str, str, str], dict[str, object]] = {}
    for r in sorted(rows, key=lambda x: x["registration_no"]):
        comps = components(r["inn"])
        generic = " + ".join(comps) if comps else None
        name, strength = clean_name(r["trade_name"])
        form, unit = map_form(r["dosage_form"])
        if not strength and len(comps) == 1:
            strength, _ = find_strength(r["inn"].split("…")[0])
        if not strength and len(comps) == 1 and form in ("Tablet", "Capsule"):
            # "Mebux-80", "Flutrox 200": a single-molecule solid named with its mg strength.
            m = re.search(r"(?<![\d./])(\d{1,4}(?:\.\d+)?)\s*$", name)
            if m and 0 < float(m.group(1)) <= 2000:
                strength = f"{m.group(1)}mg"
        if not name:
            name = (generic or r["trade_name"]).title()
        g = f" {generic or ''} "
        controlled = has_any(g, CONTROLLED)
        otc = (bool(comps) and not controlled and form not in ("Injection", "Infusion")
               and all(otc_component(c) for c in comps))
        key = (name.lower(), (strength or "").lower(), form.lower())
        if key in out:
            continue  # same product registered more than once (e.g. different holders) — keep the first
        out[key] = {
            "name": name, "brand_name": name, "generic_name": generic, "manufacturer": r["mah"].strip() or None,
            "strength": strength, "dosage_form": form, "base_unit": unit, "is_controlled": controlled,
            "requires_prescription": not otc, "is_otc": otc, "category": categorise(r["dosage_form"], generic or ""),
            "ppb_registration_no": r["registration_no"].strip(), "inn": r["inn"].replace("…", "").strip(),
            "mah": r["mah"].strip() or None, "country_of_origin": r["country_of_origin"].strip() or None,
            "ppb_registration_expiry": r["expiry_date"].strip() or None,
        }
    return list(out.values())


COLS = ["name", "brand_name", "generic_name", "manufacturer", "strength", "dosage_form", "base_unit", "is_controlled",
        "requires_prescription", "is_otc", "category", "source", "ppb_registration_no", "inn", "mah",
        "country_of_origin", "ppb_registration_expiry"]


def to_sql(items: list[dict[str, object]]) -> str:
    lines = [
        "-- migrate:up",
        "-- GENERATED by scripts/gen_ppb_catalog_sql.py from packages/db/data/ppb/retained-products.csv",
        "-- (Source: Pharmacy and Poisons Board, Kenya). Do not edit by hand — fix the script and regenerate.",
        f"-- {len(items)} registered medicines for catalogue search + autofill (source = 'ppb', unpriced).",
        "-- Curated rows win any (name, strength, dosage_form) clash: ON CONFLICT DO NOTHING.",
        "",
    ]
    for i in range(0, len(items), 500):
        lines.append(f"INSERT INTO drug_catalog ({', '.join(COLS)}) VALUES")
        vals = []
        for it in items[i : i + 500]:
            v = []
            for c in COLS:
                if c == "source":
                    v.append("'ppb'")
                elif c in ("is_controlled", "requires_prescription", "is_otc"):
                    v.append("true" if it[c] else "false")
                else:
                    v.append(sql_str(it[c]))
            vals.append("  (" + ", ".join(v) + ")")
        lines.append(",\n".join(vals))
        lines.append("ON CONFLICT DO NOTHING;")
        lines.append("")
    lines += [
        "-- migrate:down",
        "UPDATE product SET catalog_id = NULL WHERE catalog_id IN (SELECT id FROM drug_catalog WHERE source = 'ppb');",
        "DELETE FROM drug_catalog WHERE source = 'ppb';",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else CSV_PATH
    dst = sys.argv[2] if len(sys.argv) > 2 else OUT_PATH
    with open(src, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    items = build(rows)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(to_sql(items))
    print(f"{len(rows)} register rows -> {len(items)} catalogue rows -> {os.path.normpath(dst)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
