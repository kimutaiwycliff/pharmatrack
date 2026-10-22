// Pure parts of the category pickers (web CategoryPicker, Android ProductForm):
// the pharmacy's own categories merged with the default categories it hasn't
// used yet, and how a suggestion maps onto one of them. Picking a default the
// pharmacy doesn't have yet sends `category_key`; the server creates it then.
import { DEFAULT_TAXONOMY, taxonomyEntries, taxonomyKey, type CategorySuggestion } from "./taxonomy"

export interface TenantCategory {
  id: string
  name: string
  parent_id: string | null
  default_key?: string | null
}

export interface CategoryOption {
  /** A category id, or "default:<key>" for a default not created yet. */
  value: string
  label: string
  group: string
  /** Not in the pharmacy's categories yet. */
  isNew: boolean
}

export const DEFAULT_PREFIX = "default:"
export const isDefaultValue = (v: string | null | undefined): v is string => !!v && v.startsWith(DEFAULT_PREFIX)
export const defaultKeyOf = (v: string) => v.slice(DEFAULT_PREFIX.length)

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const ORDER = Object.keys(DEFAULT_TAXONOMY)

/** Every option, grouped by department: the pharmacy's own first-class, defaults filling the gaps. */
export function buildCategoryOptions(tenant: TenantCategory[]): CategoryOption[] {
  const parents = tenant.filter((c) => !c.parent_id)
  const children = (pid: string) => tenant.filter((c) => c.parent_id === pid)
  const usedKeys = new Set(tenant.map((c) => c.default_key).filter(Boolean))
  const groups = new Map<string, { order: number; items: CategoryOption[] }>()
  const add = (group: string, order: number, item: CategoryOption) => {
    const g = groups.get(group) ?? { order, items: [] }
    g.items.push(item)
    groups.set(group, g)
  }

  for (const p of parents) {
    const defaultCat = ORDER.find((c) => (p.default_key ? p.default_key === taxonomyKey(c) : same(c, p.name)))
    const order = defaultCat ? ORDER.indexOf(defaultCat) : ORDER.length
    const kids = children(p.id)
    if (kids.length === 0 && !defaultCat) add(p.name, order, { value: p.id, label: p.name, group: p.name, isNew: false })
    for (const k of kids) add(p.name, order, { value: k.id, label: k.name, group: p.name, isNew: false })
    if (defaultCat) {
      for (const sub of DEFAULT_TAXONOMY[defaultCat as keyof typeof DEFAULT_TAXONOMY]) {
        const key = taxonomyKey(defaultCat, sub)
        if (usedKeys.has(key) || kids.some((k) => same(k.name, sub))) continue
        add(p.name, order, { value: DEFAULT_PREFIX + key, label: sub, group: p.name, isNew: true })
      }
    }
  }
  // Departments the pharmacy hasn't got at all.
  const covered = new Set(parents.map((p) => ORDER.find((c) => (p.default_key ? p.default_key === taxonomyKey(c) : same(c, p.name)))).filter(Boolean))
  for (const e of taxonomyEntries()) {
    if (covered.has(e.category) || usedKeys.has(e.key)) continue
    add(e.category, ORDER.indexOf(e.category), { value: DEFAULT_PREFIX + e.key, label: e.subcategory, group: e.category, isNew: true })
  }
  return [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    .flatMap(([, g]) => g.items)
}

/** The option a suggestion points at: the pharmacy's own (linked or same-named) first, else the default. */
export function optionForSuggestion(options: CategoryOption[], tenant: TenantCategory[], s: Pick<CategorySuggestion, "category" | "subcategory">): string {
  const key = taxonomyKey(s.category, s.subcategory)
  const linked = tenant.find((c) => c.default_key === key)
  if (linked) return linked.id
  const parent = tenant.find((c) => !c.parent_id && (c.default_key === taxonomyKey(s.category) || same(c.name, s.category)))
  const named = parent && tenant.find((c) => c.parent_id === parent.id && same(c.name, s.subcategory))
  if (named) return named.id
  return options.find((o) => o.value === DEFAULT_PREFIX + key)?.value ?? DEFAULT_PREFIX + key
}

/** "Penicillins · Antibiotics & Infections" for any value (also ids not in `options`). */
export function categoryLabel(value: string | null | undefined, options: CategoryOption[], tenant: TenantCategory[]): string | null {
  if (!value) return null
  const o = options.find((x) => x.value === value)
  if (o) return o.label === o.group ? o.label : `${o.label} · ${o.group}`
  const c = tenant.find((x) => x.id === value)
  if (!c) return null
  const p = c.parent_id ? tenant.find((x) => x.id === c.parent_id) : null
  return p ? `${c.name} · ${p.name}` : c.name
}

/** The product API field for a picked value. */
export function categoryPayload(value: string | null | undefined): { category_id?: string | null; category_key?: string } {
  if (!value) return {}
  return isDefaultValue(value) ? { category_key: defaultKeyOf(value) } : { category_id: value }
}
