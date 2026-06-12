"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { syncOfflineSales } from "@/lib/offline/sync"

/** Flushes queued offline sales on mount and whenever connectivity returns. */
export function OfflineSync() {
  const running = useRef(false)

  useEffect(() => {
    async function run() {
      if (running.current) return
      running.current = true
      try {
        const { synced, dropped } = await syncOfflineSales()
        if (synced > 0) toast.success(`Synced ${synced} offline sale${synced > 1 ? "s" : ""}`)
        if (dropped > 0) {
          toast.error(
            `Discarded ${dropped} invalid offline sale${dropped > 1 ? "s" : ""} that couldn't be synced.`,
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
  }, [])

  return null
}
