// Pure helpers for the /products list and the catalogue autofill.

export type ProductFilter = "all" | "active" | "inactive" | "rx" | "controlled"

export const PRODUCT_FILTERS: { key: ProductFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "rx", label: "Rx" },
  { key: "controlled", label: "Controlled" },
]

/** GET /api/products has no flag filters, so chips narrow the rows already loaded. */
export function filterProducts<T extends { is_active: boolean; requires_prescription: boolean; is_controlled: boolean }>(
  items: T[],
  filter: ProductFilter,
): T[] {
  switch (filter) {
    case "active":
      return items.filter((p) => p.is_active)
    case "inactive":
      return items.filter((p) => !p.is_active)
    case "rx":
      return items.filter((p) => p.requires_prescription)
    case "controlled":
      return items.filter((p) => p.is_controlled)
    default:
      return items
  }
}

/** The server only searches from 2 characters (route.ts: `q.length >= 2`). */
export function searchTerm(typed: string): string | undefined {
  const t = typed.trim()
  return t.length >= 2 ? t : undefined
}

/** Offline catalogue search over the bundled KEML rows — same fields as GET /api/catalog. */
export function searchCatalogRows<T extends { name: string; strength: string | null }>(rows: T[], q: string, limit = 8): T[] {
  const t = q.trim().toLowerCase()
  if (!t) return []
  const hits = rows.filter((r) => r.name.toLowerCase().includes(t) || (r.strength ?? "").toLowerCase().includes(t))
  // Names that start with the query first, then alphabetical.
  hits.sort((a, b) => {
    const as = a.name.toLowerCase().startsWith(t) ? 0 : 1
    const bs = b.name.toLowerCase().startsWith(t) ? 0 : 1
    return as - bs || a.name.localeCompare(b.name)
  })
  return hits.slice(0, limit)
}

/** Product images from the server are app-relative (`/api/media/<key>`); local ones are file:// URIs. */
export function resolveImageUrl(url: string | null | undefined, apiBase: string | undefined): string | null {
  if (!url) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
  if (!apiBase) return null
  return `${apiBase.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`
}
