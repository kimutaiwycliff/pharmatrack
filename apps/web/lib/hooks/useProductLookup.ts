"use client"

import { useQuery } from "@tanstack/react-query"
import type { ProductWithStock } from "@pharmatrack/types"

interface LookupResult {
  found: boolean
  product?: ProductWithStock
  suggestion?: {
    name: string
    manufacturer: string
    gtin: string
  }
}

async function lookupProduct(barcode: string, branchId?: string): Promise<LookupResult> {
  const params = new URLSearchParams({ barcode })
  if (branchId) params.set("branch_id", branchId)

  const res = await fetch(`/api/products/lookup?${params.toString()}`)
  if (!res.ok) throw new Error("Lookup failed")
  return (await res.json()) as LookupResult
}

export function useProductLookup(barcode: string | null, branchId?: string) {
  return useQuery<LookupResult>({
    queryKey: ["productLookup", barcode, branchId],
    enabled: !!barcode && barcode.length >= 3,
    queryFn: () => lookupProduct(barcode!, branchId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  })
}
