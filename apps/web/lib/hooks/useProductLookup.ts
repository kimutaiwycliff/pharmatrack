"use client"

import { useQuery } from "@tanstack/react-query"
import type { ProductWithStock } from "@pharmatrack/types"
import { getCachedProduct } from "@/lib/offline/db"

interface LookupResult {
  found: boolean
  product?: ProductWithStock
  suggestion?: {
    name: string
    manufacturer: string
    gtin: string
  }
}

async function lookupProduct(barcode: string, branchId?: string, context?: "receive"): Promise<LookupResult> {
  const params = new URLSearchParams({ barcode })
  if (branchId) params.set("branch_id", branchId)
  if (context) params.set("context", context)

  try {
    const res = await fetch(`/api/products/lookup?${params.toString()}`)
    if (!res.ok) throw new Error("Lookup failed")
    return (await res.json()) as LookupResult
  } catch (err) {
    // Offline / network failure → try the local product cache.
    if (branchId) {
      const cached = await getCachedProduct(barcode, branchId)
      if (cached) return { found: true, product: cached }
    }
    throw err
  }
}

// `context: "receive"` tells the API this is the stock-receiving flow, where a
// pharmacist legitimately needs the last cost prefilled (it's an entry aid for
// a write they're already allowed to make) — not "browsing" catalogue margins.
export function useProductLookup(barcode: string | null, branchId?: string, context?: "receive") {
  return useQuery<LookupResult>({
    queryKey: ["productLookup", barcode, branchId, context],
    enabled: !!barcode && barcode.length >= 3,
    queryFn: () => lookupProduct(barcode!, branchId, context),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    // Run even when offline so the Dexie cache fallback in lookupProduct fires.
    networkMode: "always",
  })
}
