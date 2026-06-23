"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { syncOfflineSales } from "@/lib/offline/sync"

/** Flushes queued offline sales on mount and whenever connectivity returns. */
export function OfflineSync() {
  const running = useRef(false)
  const qc = useQueryClient()

  useEffect(() => {
    async function run() {
      if (running.current) return
      running.current = true
      try {
        const { synced, dropped, rejected } = await syncOfflineSales()
        if (synced > 0) {
          toast.success(`Synced ${synced} offline sale${synced > 1 ? "s" : ""}`)
          // Server stock changed — refresh inventory / dashboard / reports views.
          qc.invalidateQueries({ queryKey: ["inventory"] })
          qc.invalidateQueries({ queryKey: ["dashboard"] })
          qc.invalidateQueries({ queryKey: ["reports"] })
          qc.invalidateQueries({ queryKey: ["shift-summary"] })
        }
        if (dropped > 0) {
          toast.error(
            `Discarded ${dropped} invalid offline sale${dropped > 1 ? "s" : ""} that couldn't be synced.`,
          )
        }
        if (rejected > 0) {
          toast.error(
            `${rejected} offline sale${rejected > 1 ? "s" : ""} couldn't sync — insufficient stock. Removed from the queue.`,
          )
        }
      } finally {
        running.current = false
      }
    }
    void run()
    const onOnline = () => void run()
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [qc])

  return null
}
