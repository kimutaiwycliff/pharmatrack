// Derive a coarse generic_name (molecule grouping key) from a product name when
// one isn't supplied — strips the strength and common form/qualifier words so
// variants share a key (e.g. "Amoxicillin 250mg" / "500mg" → "amoxicillin").
// Mirrors scripts/gen_catalog_seed.py; the catalogue's curated generics are
// richer (real brand↔molecule mapping), this is the fallback for ad-hoc products.
const STRENGTH = /\d+\.?\d*\s*(mg|mcg|g|iu|%)\b/gi
const FORM = /\b(tabs?|tablets?|caps?|capsules?|susp(ension)?|syrup|expectorant|inj(ection)?|cream|oint(ment)?|drops?|gel|sachet|bottle|lotion|balm|powder|spray|lozenges?|suppositor\w*|pess\w*|forte|plus|sr|mr|cr|paed|adult)\b/gi

export function deriveGenericName(name: string): string | null {
  const g = name
    .replace(/['’`]/g, "'")
    .replace(/\b\d+\s*(?:'|,|;)?\s*s\b/gi, " ") // pack counts: 30's, 100s, 10,S
    .replace(/\b\d+(?:\.\d+)?\s*(?:mls?|gms?|g|l)\b/gi, " ") // pack volumes: 100ml, 15g
    .replace(STRENGTH, " ")
    .replace(FORM, " ")
    .replace(/[^a-zA-Z0-9+\- ]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
  return g || null
}
