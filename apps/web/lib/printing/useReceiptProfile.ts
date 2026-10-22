"use client"

import { useQuery } from "@tanstack/react-query"
import type { ReceiptProfile } from "@pharmatrack/core"

export const RECEIPT_PROFILE_KEY = ["receiptProfile"] as const

/**
 * How this pharmacy's receipts are branded (Settings → Receipt). Cached for the
 * session: the POS warms it on load, so a receipt never waits on it. Until it
 * arrives (or if it fails) receipts print with the plain default layout.
 */
export function useReceiptProfile() {
  return useQuery<ReceiptProfile>({
    queryKey: RECEIPT_PROFILE_KEY,
    queryFn: async () => {
      const res = await fetch("/api/receipt-profile")
      if (!res.ok) throw new Error("Couldn't load receipt settings")
      return res.json() as Promise<ReceiptProfile>
    },
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  })
}
