"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import type { Shift } from "@pharmatrack/types"

export function useActiveShift(userId: string | null | undefined) {
  return useQuery<Shift | null>({
    queryKey: ["activeShift", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null
      const supabase = createClient()
      const { data } = await supabase
        .from("shifts")
        .select("*")
        .eq("staff_id", userId)
        .is("clocked_out_at", null)
        .order("clocked_in_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data ?? null) as Shift | null
    },
    staleTime: 30_000,
  })
}
