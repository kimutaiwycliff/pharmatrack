#!/usr/bin/env python3
"""Normalize Pharmacy_Inventory_Enriched.xlsx → a clean drug_catalog seed.

Reality of the source: real Nairobi pharmacy list, but only ~half the rows are
enriched and the strength/form columns have errors, so we derive strength + form
from the ITEM NAME first (most reliable), map units, derive a generic_name
(molecule) for "related products" grouping, and dedupe on (name,strength,form).
Prints stats; with --sql writes the upsert migration body.
"""
import zipfile, re, sys, json
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def load_rows(path):
    z = zipfile.ZipFile(path)
    def colnum(ref):
        s = re.match(r"([A-Z]+)\d+", ref).group(1); n = 0
        for ch in s: n = n*26 + (ord(ch)-64)
        return n-1
    sh = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sh.iter(f"{NS}row"):
        cells = {}
        for c in row.findall(f"{NS}c"):
            isv = c.find(f"{NS}is"); v = c.find(f"{NS}v")
            val = "".join(x.text or "" for x in isv.iter(f"{NS}t")) if isv is not None else (v.text if v is not None else "")
            cells[colnum(c.get("r"))] = (val or "").strip()
        if cells:
            m = max(cells); rows.append([cells.get(i, "") for i in range(m+1)])
    return rows

# Common Kenyan brand → molecule (generic) map so generic↔brand grouping works.
BRAND2MOL = {
    "flagyl": "metronidazole", "nexium": "esomeprazole", "motilium": "domperidone",
    "buscopan": "hyoscine", "dulcolax": "bisacodyl", "plasil": "metoclopramide",
    "calpol": "paracetamol", "panadol": "paracetamol", "hedex": "paracetamol",
    "brufen": "ibuprofen", "ibugesic": "ibuprofen", "brustan": "ibuprofen+paracetamol",
    "voltaren": "diclofenac", "diclomal": "diclofenac", "ascard": "aspirin",
    "cardisprin": "aspirin", "ascoril": "expectorant", "glucomet": "metformin",
    "nogluc": "glimepiride", "losartas": "losartan", "presartan": "losartan",
    "carditan": "losartan", "calcicard": "amlodipine", "amlong": "amlodipine",
    "enaril": "enalapril", "lonart": "artemether+lumefantrine", "fanlar": "sulfadoxine+pyrimethamine",
    "ampiclox": "ampicillin+cloxacillin", "amoxiclav": "amoxicillin+clavulanate",
    "augmentin": "amoxicillin+clavulanate", "ctx": "co-trimoxazole", "septrin": "co-trimoxazole",
    "zinnat": "cefuroxime", "ceftrin": "ceftriaxone", "daktarin": "miconazole",
    "candid": "clotrimazole", "canesten": "clotrimazole", "funbact": "clotrimazole",
    "stepsils": "lozenge", "strepsils": "lozenge", "zyrtec": "cetirizine", "zyrtai": "cetirizine",
    "celestamine": "betamethasone+loratadine", "piriton": "chlorpheniramine", "pirton": "chlorpheniramine",
    "cpm": "chlorpheniramine", "euthyrox": "levothyroxine", "sinemet": "levodopa+carbidopa",
    "daflon": "diosmin+hesperidin", "ranferon": "iron+folic", "neurorubine": "vitamin b complex",
    "tribees": "vitamin b complex", "becoactin": "vitamin b complex", "astymin": "amino acids",
    "myospaz": "ibuprofen+chlorzoxazone", "acepar": "aceclofenac+paracetamol",
    "zulu": "aceclofenac", "acedofenac": "aceclofenac", "subsyde": "diclofenac",
    "maxitrol": "dexamethasone+neomycin", "anusol": "hemorrhoid", "anomex": "hemorrhoid",
    "volini": "diclofenac", "relcer": "antacid", "gastrogel": "antacid", "allugel": "antacid",
    "neutricid": "antacid", "enterozole": "metronidazole+furazolidone", "diracip": "antacid",
    "secnidazole": "secnidazole", "abz": "albendazole", "albaxate": "albendazole",
    "nilworm": "levamisole", "olworm": "albendazole", "calamine": "calamine",
}

# Dosage form keyword → canonical form, checked against the item name.
FORM_KW = [
    (r"\bsuppositor", "Suppository"), (r"\bpessar|\bpess\b", "Pessary"),
    (r"\beye\s*drops?|\bear\s*drops?|\bdrops?\b", "Drops"), (r"\binhaler\b", "Inhaler"),
    (r"\bexpectorant|\bsyrup\b|\bsusp(ension)?\b|\bsuspn\b", "Syrup"),
    (r"\bspray\b", "Spray"), (r"\block?z?enge|\blozenges?\b", "Lozenge"),
    (r"\bcream\b", "Cream"), (r"\boint(ment)?\b", "Ointment"), (r"\bgel\b", "Gel"),
    (r"\blotion\b", "Lotion"), (r"\bbalm\b", "Balm"), (r"\bpowder\b", "Powder"),
    (r"\bmouth\s*wash|\bmouth\s*paint|\bsolution\b", "Solution"), (r"\bsachet", "Sachet"),
    (r"\binj(ection)?\b|\bamp(oule|s)?\b|\bvial", "Injection"),
    (r"\bcaps?(ule)?\b", "Capsule"), (r"\btabs?(let)?\b", "Tablet"),
]
UNIT2BASE = {
    "tabs": "tablet", "tab": "tablet", "caps": "capsule", "cap": "capsule",
    "bottles": "bottle", "tubes": "tube", "vials": "vial", "amps": "ampoule",
    "sachets": "sachet", "pcs": "piece", "pkts": "packet", "lozenges": "lozenge",
    "cans": "can", "pairs": "pair",
}
UNIT2FORM = {  # fallback form when name gives nothing
    "tabs": "Tablet", "caps": "Capsule", "tubes": "Cream", "vials": "Injection",
    "amps": "Injection", "lozenges": "Lozenge", "sachets": "Sachet", "bottles": "Syrup",
}
RX_CATS = {"Antibiotics & Antifungals", "Cardiovascular & Metabolic", "Psychiatric Medications", "Injections & Misc"}
CONTROLLED_KW = ["phenobarb", "diazepam", "morphine", "codeine", "tramadol", "pethidine", "chlorpromazine", "haloperidol", "alprazolam", "pregabalin", "amitriptyline"]

STRENGTH_RE = re.compile(r"(\d+\.?\d*)\s*(mg|mcg|g|iu|mu|%)\b", re.I)
VOLUME_RE = re.compile(r"\b\d+\.?\d*\s*ml?s?\b", re.I)

def clean_name(s): return re.sub(r"\s+", " ", s).strip()

def derive_strength(name, col):
    m = STRENGTH_RE.search(name)
    if m: return f"{m.group(1)}{m.group(2).lower().replace('mu','MU')}"
    if col and STRENGTH_RE.search(col):
        mm = STRENGTH_RE.search(col); return f"{mm.group(1)}{mm.group(2).lower().replace('mu','MU')}"
    return None

def derive_form(name, col, unit):
    low = name.lower()
    for pat, form in FORM_KW:
        if re.search(pat, low): return form
    if col: return col
    return UNIT2FORM.get(unit)

def derive_generic(name):
    low = name.lower()
    for brand, mol in BRAND2MOL.items():
        if re.search(r"\b" + re.escape(brand), low): return mol
    # strip strength, volume, form words, pack words → molecule guess
    g = STRENGTH_RE.sub("", name); g = VOLUME_RE.sub("", g)
    g = re.sub(r"\b(tabs?|tablet|caps?|capsule|susp(ension)?|syrup|expectorant|inj(ection)?|cream|oint(ment)?|drops?|gel|sachet|bottle|lotion|balm|powder|spray|lozenges?|suppositor\w*|pess\w*|forte|plus|sr|mr|cr|paed|adult|herbal)\b", "", g, flags=re.I)
    return clean_name(re.sub(r"[^a-zA-Z0-9+\- ]", "", g)).lower() or low

def yn(v): return (v or "").strip().lower() in ("yes", "y", "true", "1")

def num(v):
    try: return float(v) if v not in (None, "") else None
    except: return None

def main():
    rows = load_rows("Pharmacy_Inventory_Enriched.xlsx")
    data = [r for r in rows[1:] if len(r) > 1 and (r[0] or "").strip().isdigit()]
    out = []
    seen = set()
    for r in data:
        r = r + [""] * (15 - len(r))
        name0 = clean_name(r[1]); cat = r[3].strip(); unit = r[2].strip().lower()
        if not name0: continue
        strength = derive_strength(name0, r[5])
        form = derive_form(name0, r[6], unit)
        base = UNIT2BASE.get(unit, "tablet")
        brand = clean_name(r[4]) or None
        # name: strip the strength token so variants share a name (Flagyl 200/400 → Flagyl)
        name = clean_name(STRENGTH_RE.sub("", name0)) or name0
        generic = derive_generic(name0)
        key = (name.lower(), (strength or "").lower(), (form or "").lower())
        if key in seen: continue
        seen.add(key)
        controlled = yn(r[13]) or any(k in name0.lower() for k in CONTROLLED_KW)
        rx = yn(r[11]) or (not (r[14] or "").strip() and cat in RX_CATS) or controlled
        otc = yn(r[12]) or (not rx)
        out.append({
            "name": name, "brand_name": brand, "strength": strength, "dosage_form": form,
            "base_unit": base, "generic_name": generic, "category": cat,
            "is_controlled": controlled, "requires_prescription": rx, "is_otc": otc,
            "cost": num(r[9]), "sell": num(r[10]),
            "pack_label": clean_name(r[7]) or None, "units_per_pack": int(num(r[8])) if num(r[8]) else 1,
        })
    if "--sql" in sys.argv:
        print(emit_sql(out))
        return
    # stats
    from collections import Counter
    print(f"normalized rows: {len(out)}  (from {len(data)} source rows)")
    print(f"with strength: {sum(1 for o in out if o['strength'])}  | with form: {sum(1 for o in out if o['dosage_form'])}  | with price: {sum(1 for o in out if o['sell'])}")
    print(f"controlled: {sum(1 for o in out if o['is_controlled'])} | rx: {sum(1 for o in out if o['requires_prescription'])}")
    gc = Counter(o["generic_name"] for o in out)
    multi = [(g, n) for g, n in gc.items() if n > 1]
    print(f"\ngeneric groups with >1 variant: {len(multi)}")
    for g, n in sorted(multi, key=lambda x: -x[1])[:14]:
        variants = [f"{o['name']} {o['strength'] or ''}{'/'+o['brand_name'] if o['brand_name'] else ''}".strip() for o in out if o["generic_name"] == g]
        print(f"  [{g}] ×{n}: {', '.join(variants[:5])}")
    print("\n--- 10 normalized samples ---")
    for o in out[:10]: print("  ", {k: o[k] for k in ("name","strength","dosage_form","base_unit","brand_name","generic_name","category")})

def sq(s):
    if s is None: return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def emit_sql(out):
    vals = []
    for o in out:
        vals.append("(" + ", ".join([
            sq(o["name"]), sq(o["brand_name"]), sq(o["strength"]), sq(o["dosage_form"]),
            sq(o["base_unit"]), sq(o["generic_name"]), sq(o["category"]),
            "true" if o["is_controlled"] else "false", "true" if o["requires_prescription"] else "false",
            "true" if o["is_otc"] else "false",
            "NULL" if o["cost"] is None else str(o["cost"]),
            "NULL" if o["sell"] is None else str(o["sell"]),
            sq(o["pack_label"]), str(o["units_per_pack"]),
        ]) + ")")
    return ",\n".join(vals)

main()
