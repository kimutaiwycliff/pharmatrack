// Recognise a pharmacy's product line ("AMOXICLAV (ACINET) 625MG 14'S") in the
// shared catalogue (PPB register + curated list) so an import can fill the
// cells the sheet left blank: generic, form, Rx/controlled flags, category.
// Brand + strength agreeing = "exact"; brand only = "brand"; only the
// molecule recognised = "generic". The pharmacy's own values always win.

export interface CatalogEntry {
  id: string
  name: string
  brand_name: string | null
  generic_name: string | null
  strength: string | null
  dosage_form: string | null
  base_unit: string | null
  manufacturer: string | null
  is_controlled: boolean
  requires_prescription: boolean
  category: string | null
  subcategory: string | null
  source: string
  ppb_registration_no: string | null
}

export interface CatalogMatch {
  entry: CatalogEntry
  confidence: "exact" | "brand" | "generic"
}

export interface CatalogIndex {
  byWord: Map<string, CatalogEntry[]>
  generics: Array<{ word: string; entries: CatalogEntry[] }>
}

// Words that say nothing about which product it is.
const NOISE = new Set(
  ("tabs tab tablet tablets caps cap capsule capsules syrup syp susp suspension cream crm oint ointment gel drops drop " +
    "inj injection sol solution ml mls g gm gms mg mcg iu s new price pcs generic bp usp ph eur forte plus mr la sr er xr dt " +
    "for oral the and kids kid adult adults paed paediatric dry powder sachet sachets film coated dispersible effervescent " +
    "chewable hcl hydrochloride sodium potassium vit vitamin vitamins").split(" "),
)

/** "Amoxiclav-Denk 625MG 14`S" → "amoxiclav denk 625mg 14's" */
export function cleanProductText(s: string): string {
  return s
    .replace(/&#0?39;|&apos;|`|’/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/** Strength in a comparable form: "500 MG" → "500mg", "125mg/5ml" kept whole. */
export function normStrength(s: string | null | undefined): string | null {
  if (!s) return null
  const m = s.toLowerCase().replace(/\s+/g, "").match(/\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?(?:mg|mcg|g|ml|iu|%)(?:\/\d*(?:\.\d+)?(?:mg|ml|g))?/)
  return m ? m[0] : null
}

const words = (s: string) => (s.match(/[a-z][a-z-]+/g) ?? []).filter((w) => w.length >= 3 && !NOISE.has(w))

export function buildCatalogIndex(entries: CatalogEntry[]): CatalogIndex {
  const byWord = new Map<string, CatalogEntry[]>()
  const add = (w: string | undefined, e: CatalogEntry) => {
    if (!w || w.length < 3) return
    const list = byWord.get(w) ?? []
    if (!list.includes(e)) list.push(e)
    byWord.set(w, list)
  }
  const genericMap = new Map<string, CatalogEntry[]>()
  for (const e of entries) {
    add(words(cleanProductText(e.name))[0], e)
    if (e.brand_name) add(words(cleanProductText(e.brand_name))[0], e)
    const g = (e.generic_name ?? "").toLowerCase().trim()
    // Single-molecule generics only ("amoxicillin"), for "generic" matches.
    if (/^[a-z]{6,}$/.test(g)) genericMap.set(g, [...(genericMap.get(g) ?? []), e])
  }
  const generics = [...genericMap.entries()].map(([word, es]) => ({ word, entries: es })).sort((a, b) => b.word.length - a.word.length)
  return { byWord, generics }
}

const FORM_HINTS: Array<[RegExp, string]> = [
  [/\b(tabs?|tablets?)\b|'s\b|\d+s\b/, "tablet"], [/\bcaps?(ules?)?\b/, "capsule"], [/\b(syrup|syp|susp|suspension|linctus)\b/, "syrup"],
  [/\b(cream|crm)\b/, "cream"], [/\boint(ment)?\b/, "ointment"], [/\bgel\b/, "gel"], [/\bdrops?\b/, "drops"], [/\binj(ection)?\b/, "injection"],
]
function formFamily(s: string | null | undefined): string | null {
  const t = (s ?? "").toLowerCase()
  if (/tablet/.test(t)) return "tablet"
  if (/capsule/.test(t)) return "capsule"
  if (/syrup|suspension|solution|liquid|elixir/.test(t)) return "syrup"
  if (/cream/.test(t)) return "cream"
  if (/ointment/.test(t)) return "ointment"
  if (/gel/.test(t)) return "gel"
  if (/drop/.test(t)) return "drops"
  if (/inject|infusion/.test(t)) return "injection"
  return null
}

/** The catalogue entry a sheet row most likely is, or null. */
export function matchCatalog(index: CatalogIndex, row: { name: string; strength?: string | null; dosageForm?: string | null }): CatalogMatch | null {
  const text = cleanProductText(row.name)
  const rowStrength = normStrength(row.strength) ?? normStrength(text)
  const rowForm = formFamily(row.dosageForm) ?? FORM_HINTS.find(([re]) => re.test(text))?.[1] ?? null
  // Words in brackets — "(LYSODOL 100MG)", "(ACINET)" — usually the brand.
  const paren = (text.match(/[([][^)\]]*[)\]]/g) ?? []).flatMap((p) => words(p))
  // Brand first: the leading word, unless it's a molecule ("AMOXICLAV (ACINET)"),
  // in which case the bracketed brand goes first.
  const lead = words(text.replace(/[([][^)\]]*[)\]]/g, " "))
  const isGeneric = (w: string | undefined) => !!w && index.generics.some((g) => g.word === w || (w.length >= 7 && g.word.startsWith(w.slice(0, 7))))
  const tries = [...new Set(isGeneric(lead[0]) ? [...paren.slice(0, 2), ...lead.slice(0, 2)] : [...lead.slice(0, 1), ...paren.slice(0, 2), ...lead.slice(1, 2)])]

  // The first word that names something wins (a bracketed brand before the
  // first words), so "ACECLOFENAC + PARACETAMOL (ACTINAC)" isn't read as paracetamol.
  let best: { e: CatalogEntry; score: number; strengthOk: boolean; formOk: boolean } | null = null
  for (const w of tries) {
    const hits = [...(index.byWord.get(w) ?? [])]
    // Tolerate a short suffix on longer brand words ("augmentins", "lonart-ds") — not "cyclovir" → "cyclo".
    if (hits.length === 0 && w.length >= 6) {
      for (const [k, es] of index.byWord) {
        if (k.length >= 5 && Math.abs(k.length - w.length) <= 2 && (w.startsWith(k) || k.startsWith(w))) hits.push(...es)
      }
    }
    for (const e of hits) {
      const es = normStrength(e.strength) ?? normStrength(cleanProductText(e.name))
      const strengthOk = !!rowStrength && !!es && es === rowStrength
      const ef = formFamily(e.dosage_form)
      const formOk = !rowForm || !ef || ef === rowForm
      const score = (strengthOk ? 4 : 0) + (formOk ? 2 : 0) + (e.source === "curated" ? 1 : 0)
      if (!best || score > best.score) best = { e, score, strengthOk, formOk }
    }
    if (best) break
  }
  if (best) return { entry: best.e, confidence: best.strengthOk && best.formOk ? "exact" : "brand" }
  // No brand: is the molecule named? ("AMOXICILLIN GENERIC 500MG 100S")
  for (const g of index.generics) {
    if (!new RegExp(`\\b${g.word}\\b`).test(text)) continue
    const same = g.entries.find((e) => rowStrength && normStrength(e.strength) === rowStrength) ?? g.entries[0]!
    return { entry: same, confidence: "generic" }
  }
  return null
}
