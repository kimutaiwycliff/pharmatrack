"use client"

import { CloudOff, RefreshCw } from "lucide-react"
import { useUnsyncedCount } from "@/lib/offline/useUnsyncedCount"
import { useOnline } from "@/lib/offline/useOnline"

/**
 * Live "N queued / syncing…" chip for the POS header. Shows the real count of
 * unsynced offline sales so the cashier can see at a glance whether everything
 * has flushed — instead of relying on transient toasts. When online it doubles
 * as a manual retry (re-fires the sync the OfflineSync component listens for).
 */
export function OfflineQueueBadge() {
  const count = useUnsyncedCount()
  const online = useOnline()
  if (count === 0) return null

  const base = "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"

  if (online) {
    return (
      <button type="button" title="Retry sync now" onClick={() => window.dispatchEvent(new Event("online"))} className={`${base} hover:bg-amber-100 dark:hover:bg-amber-500/25 transition-colors`}>
        <RefreshCw size={13} className="animate-spin" /> Syncing {count}…
      </button>
    )
  }
  return (
    <div className={base}>
      <CloudOff size={13} /> {count} queued
    </div>
  )
}
