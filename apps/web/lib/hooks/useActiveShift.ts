"use client"

import { useQuery } from "@tanstack/react-query"
import type { Shift } from "@pharmatrack/types"

export function useActiveShift(userId: string | null | undefined) {
  return useQuery<Shift | null>({
    queryKey: ["activeShift", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch("/api/shifts/active")
      if (!res.ok) return null
      const json = (await res.json()) as { shift: Shift | null }
      return json.shift
    },
    staleTime: 30_000,
  })
}
