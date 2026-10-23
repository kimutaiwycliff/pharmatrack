// Quick Start picker (web QuickStartPicker): the shared catalogue — curated
// everyday range + PPB register — grouped the way a pharmacist thinks: one row
// per molecule + strength + form ("Amlodipine 5mg · Tablet"), with the
// registered brands underneath. Curated ("common in Kenyan pharmacies") first.
import { DEFAULT_TAXONOMY } from "./taxonomyRules"
import { normStrength } from "./catalogMatch"

export interface QsEntry {
  id: string
  name: string
  brand: string | null
  generic: string | null
  strength: string | null
  form: string | null
  manufacturer: string | null
  category: string | null
  subcategory: string | null
  source: "curated" | "ppb"
  ppb: string | null
  rx: boolean
  controlled: boolean
  /** Reference selling price per unit (curated rows only). */
  price: number | null
}

export interface QsGroup {
  key: string
  /** "Amlodipine 5mg · Tablet" */
  label: string
  category: string
  subcategory: string
  entries: QsEntry[]
  /** Has a curated ("common in Kenyan pharmacies") entry. */
  common: boolean
  /** What ticking the row picks: the curated entry, or the only brand. Null = choose a brand. */
  defaultId: string | null
  rx: boolean
  controlled: boolean
}

const SALTS = new Set(("hydrochloride hcl sodium potassium calcium magnesium besilate besylate maleate mesylate mesilate fumarate succinate " +
  "tartrate citrate acetate phosphate sulphate sulfate trihydrate monohydrate dihydrate anhydrous usp bp ph eur inn ip micronized micronised").split(" "))

/** "Amlodipine Besilate BP" → "amlodipine"; components kept in order, joined " + ". */
export function normGeneric(g: string): string {
  return g
    .toLowerCase()
    .split(/\s*(?:\+|,|&|\band\b|\bwith\b)\s*/)
    .map((part) => part.replace(/[^a-z0-9 -]/g, " ").split(/\s+/).filter((w) => w && !SALTS.has(w) && !/^\d+(?:\.\d+)?(?:mg|mcg|g|ml|iu|%)$/.test(w)).join(" "))
    .filter(Boolean)
    .join(" + ")
}

function formFamily(f: string | null): string {
  const t = (f ?? "").toLowerCase()
  for (const [re, name] of [[/tablet/, "Tablet"], [/capsule/, "Capsule"], [/syrup|suspension|solution|liquid|elixir/, "Liquid"], [/eye/, "Eye drops"],
    [/ear/, "Ear drops"], [/drop/, "Drops"], [/cream/, "Cream"], [/ointment/, "Ointment"], [/gel/, "Gel"], [/inject|infusion/, "Injection"],
    [/inhal/, "Inhaler"]] as Array<[RegExp, string]>) {
    if (re.test(t)) return name
  }
  return f ? f.trim() : ""
}

const cap = (s: string) => s.replace(/(^|[\s+(-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())
const ORDER = Object.keys(DEFAULT_TAXONOMY)

/** Catalogue rows → picker rows. Uncategorised rows land in "Other" › "Other". */
export function groupCatalog(entries: QsEntry[]): QsGroup[] {
  const byKey = new Map<string, QsGroup>()
  for (const e of entries) {
    const category = e.category ?? "Other"
    const subcategory = e.subcategory ?? "Other"
    const generic = normGeneric(e.generic || e.name) || e.name.toLowerCase()
    const strength = normStrength(e.strength) ?? normStrength(e.name) ?? ""
    const form = formFamily(e.form)
    const key = `${category}|${subcategory}|${generic}|${strength}|${form}`
    let g = byKey.get(key)
    if (!g) {
      g = { key, label: [cap(generic) + (strength ? ` ${strength}` : ""), form].filter(Boolean).join(" · "), category, subcategory,
        entries: [], common: false, defaultId: null, rx: false, controlled: false }
      byKey.set(key, g)
    }
    g.entries.push(e)
  }
  for (const g of byKey.values()) {
    g.entries.sort((a, b) => (a.source === b.source ? a.name.localeCompare(b.name) : a.source === "curated" ? -1 : 1))
    const curated = g.entries.filter((e) => e.source === "curated")
    g.common = curated.length > 0
    // One obvious choice only: the single common entry (or the only priced one
    // of several), else the only brand. Several equal brands → ask.
    const priced = curated.filter((e) => e.price)
    g.defaultId = curated.length === 1 ? curated[0]!.id
      : priced.length === 1 ? priced[0]!.id
      : g.entries.length === 1 ? g.entries[0]!.id
      : null
    g.rx = g.entries.some((e) => e.rx)
    g.controlled = g.entries.some((e) => e.controlled)
  }
  return [...byKey.values()].sort((a, b) =>
    (a.common === b.common ? 0 : a.common ? -1 : 1) || a.label.localeCompare(b.label))
}

export interface QsTreeNode {
  category: string
  subcategories: Array<{ name: string; groups: number }>
  groups: number
}

/** Departments (taxonomy order) → subcategories with their row counts. */
export function quickStartTree(groups: QsGroup[]): QsTreeNode[] {
  const m = new Map<string, Map<string, number>>()
  for (const g of groups) {
    const subs = m.get(g.category) ?? new Map<string, number>()
    subs.set(g.subcategory, (subs.get(g.subcategory) ?? 0) + 1)
    m.set(g.category, subs)
  }
  const rank = (c: string) => (ORDER.includes(c) ? ORDER.indexOf(c) : ORDER.length)
  return [...m.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([category, subs]) => {
      const known = DEFAULT_TAXONOMY[category as keyof typeof DEFAULT_TAXONOMY] as readonly string[] | undefined
      const subRank = (s: string) => (known?.includes(s) ? known.indexOf(s) : 999)
      const subcategories = [...subs.entries()].sort((a, b) => subRank(a[0]) - subRank(b[0]) || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, groups: n }))
      return { category, subcategories, groups: subcategories.reduce((s, x) => s + x.groups, 0) }
    })
}

/** Every word typed must appear in the row: its label, a brand, manufacturer or PPB number. */
export function searchGroups(groups: QsGroup[], q: string, limit = 200): QsGroup[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const out: QsGroup[] = []
  for (const g of groups) {
    const hay = [g.label, ...g.entries.flatMap((e) => [e.name, e.brand, e.manufacturer, e.ppb, e.generic])].filter(Boolean).join(" ").toLowerCase()
    if (terms.every((t) => hay.includes(t))) out.push(g)
    if (out.length >= limit) break
  }
  return out
}
