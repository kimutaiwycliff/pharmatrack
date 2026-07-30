import { useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import NetInfo from "@react-native-community/netinfo"
import { syncCatalogue } from "./catalogue"
import { syncQueuedSales } from "./sales"

const POLL_INTERVAL_MS = 90_000 // mirrors apps/web/lib/offline/sync.ts's 90s safety poll

// Triggers: on mount, on app foreground, on network reconnect, and a periodic
// safety poll — same trigger set as the existing Dexie-based OfflineSync.tsx
// on web, just driven by AppState/NetInfo instead of the `online` DOM event.
export function useSyncEngine(branchId: string | null) {
  const [isOnline, setIsOnline] = useState(true)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const syncingRef = useRef(false)

  useEffect(() => {
    if (!branchId) return

    async function runSync() {
      if (syncingRef.current) return
      syncingRef.current = true
      try {
        await syncQueuedSales()
        await syncCatalogue(branchId!)
        setLastSyncedAt(Date.now())
      } catch {
        // offline or server error — next trigger (foreground/reconnect/poll) retries
      } finally {
        syncingRef.current = false
      }
    }

    runSync()

    const netUnsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected
      setIsOnline(online)
      if (online) runSync()
    })

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") runSync()
    })

    const interval = setInterval(runSync, POLL_INTERVAL_MS)

    return () => {
      netUnsubscribe()
      appStateSubscription.remove()
      clearInterval(interval)
    }
  }, [branchId])

  return { isOnline, lastSyncedAt }
}
