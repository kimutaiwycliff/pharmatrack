"use client"

import { useQuery } from "@tanstack/react-query"
import type { StkStatus } from "@/lib/mpesa/stk"

export interface StkStatusResponse {
  status: StkStatus
  message: string
  receipt: string | null
  amount: number
  used: boolean
}

/** Stop asking after this long — the till then offers resend / manual. */
const GIVE_UP_MS = 3 * 60_000

/**
 * Poll an STK push until it's paid, cancelled or failed. Our server reads its
 * own record and only queries Safaricom every ~10 s (Daraja rate-limits), so a
 * 3-second poll here is cheap.
 */
export function useStkStatus(checkoutRequestId: string | null, startedAt: number | null) {
  return useQuery<StkStatusResponse>({
    queryKey: ["stk-status", checkoutRequestId],
    enabled: !!checkoutRequestId,
    queryFn: async () => {
      const res = await fetch(`/api/mpesa/status?id=${encodeURIComponent(checkoutRequestId!)}`)
      if (!res.ok) throw new Error("Couldn't check the M-Pesa payment")
      return res.json() as Promise<StkStatusResponse>
    },
    refetchInterval: (q) => {
      const s = q.state.data?.status
      if (s && s !== "pending") return false
      if (startedAt && Date.now() - startedAt > GIVE_UP_MS) return false
      return 3_000
    },
    retry: 1,
    staleTime: 0,
  })
}

export const STK_GIVE_UP_MS = GIVE_UP_MS
