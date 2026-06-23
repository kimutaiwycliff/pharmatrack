"use client"

import { useEffect, useState } from "react"
import { liveQuery } from "dexie"
import { posDB } from "@/lib/offline/db"

/**
 * Live count of queued (unsynced) offline sales. Reactive via Dexie liveQuery —
 * updates automatically when a sale is queued, synced or dropped.
 */
export function useUnsyncedCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const sub = liveQuery(() => posDB.offlineSales.where("synced").equals(0).count())
      .subscribe({ next: setCount, error: () => {} })
    return () => sub.unsubscribe()
  }, [])
  return count
}
