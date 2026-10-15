import { useQuery } from "@tanstack/react-query"

export interface SupplierOption {
  id: string
  name: string
}

// The ONE query for the supplier list. Every screen must use this hook:
// TanStack Query shares cache entries by key, and screens that each wrote
// their own ["suppliers"] query cached different shapes (a plain list vs
// `{ suppliers }`). Whichever loaded first won, so Stock Receive crashed
// ("r.map is not a function") after visiting a product or a new purchase
// order, and the product sheet showed no suppliers after visiting Products —
// both "fixed" by a reload that emptied the cache.
export const SUPPLIERS_QUERY_KEY = ["suppliers"] as const

async function fetchSuppliers(): Promise<SupplierOption[]> {
  const res = await fetch("/api/suppliers")
  if (!res.ok) return []
  const json = (await res.json()) as { suppliers?: SupplierOption[] }
  return json.suppliers ?? []
}

export function useSuppliers(options: { enabled?: boolean } = {}) {
  return useQuery<SupplierOption[]>({
    queryKey: SUPPLIERS_QUERY_KEY,
    queryFn: fetchSuppliers,
    staleTime: 5 * 60_000,
    enabled: options.enabled ?? true,
  })
}
