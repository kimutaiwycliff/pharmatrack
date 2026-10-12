// Pure category helpers for app/categories.tsx (no RN imports — vitest).
//
// Mirrors apps/web/app/api/categories/route.ts's GET: a flat two-level list
// where every row's parent_id is null (top-level) or a top-level row's id. The
// server enforces the two levels, so the tree is just a group-by on parent_id.

export interface Category {
  id: string
  name: string
  parent_id: string | null
}

export interface CategoryRow {
  kind: "parent" | "child"
  cat: Category
  /** Number of subcategories (parents only; 0 for children). */
  childCount: number
}

/**
 * Top-level categories, each followed by its children. A row whose parent
 * isn't in the list is treated as top-level (defensive — never drop a row).
 * Server order (by name) is kept within each level.
 */
export function buildCategoryRows(categories: Category[]): CategoryRow[] {
  const byId = new Set(categories.map((c) => c.id))
  const children = new Map<string, Category[]>()
  for (const c of categories) {
    if (c.parent_id && byId.has(c.parent_id)) {
      const list = children.get(c.parent_id) ?? []
      list.push(c)
      children.set(c.parent_id, list)
    }
  }
  const rows: CategoryRow[] = []
  for (const top of categories) {
    if (top.parent_id && byId.has(top.parent_id)) continue
    const kids = children.get(top.id) ?? []
    rows.push({ kind: "parent", cat: top, childCount: kids.length })
    for (const child of kids) rows.push({ kind: "child", cat: child, childCount: 0 })
  }
  return rows
}

/** Categories that can be picked as a parent (top-level only — two levels max). */
export function parentOptions(categories: Category[]): Category[] {
  return categories.filter((c) => !c.parent_id)
}

/** Client-side mirror of the API's name rule (trim, 1..60 chars). Null = valid. */
export function categoryNameError(name: string): string | null {
  const t = name.trim()
  if (!t) return "Category name is required"
  if (t.length > 60) return "Keep the name under 60 characters"
  return null
}
