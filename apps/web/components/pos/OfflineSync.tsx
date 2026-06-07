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
        const n = await syncOfflineSales()
        if (n > 0) toast.success(`Synced ${n} offline sale${n > 1 ? "s" : ""}`)
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
