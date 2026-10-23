"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useCartStore } from "@/lib/store/cartStore"
import {
  deferSyncWhile, noteTillActivity, onSyncResult, refreshTillState, setTillOnline, setTillSession, syncNow, tickClock,
} from "@/lib/till/engine"
import { useTillStore } from "@/lib/till/store"
import { warmTillShell } from "@/components/ServiceWorkerRegister"
import { nairobiAt, nairobiYYMMDD } from "@pharmatrack/core/sync"
import { notifyDesktop } from "@/lib/desktop/notify"

// Drives the offline till engine while the POS is open: first read of
// IndexedDB, the minute clock tick (tamper guard + midnight lock), sync on
// reconnect / every 5 minutes / when the tab comes back, and toasts for the
// moments people need to hear about — never for routine background syncs.

const POLL_MS = 5 * 60_000

// Evening reminders while sales are still waiting to upload (Nairobi time).
const REMINDERS = [
  { key: "21", hour: 21, minute: 0, title: "Sync before midnight", body: (n: number) => `${n} sale${n === 1 ? " is" : "s are"} waiting to upload. Connect to the internet — selling pauses at midnight until this computer syncs.` },
  { key: "2330", hour: 23, minute: 30, title: "30 minutes to sync", body: (n: number) => `${n} sale${n === 1 ? " still needs" : "s still need"} to upload before midnight, or selling pauses until a manager unlocks it.` },
]

function remindIfDue(now = Date.now()): void {
  const { pendingSales, registered, wrongOrg } = useTillStore.getState()
  if (!registered || wrongOrg || pendingSales === 0) return
  for (const r of REMINDERS) {
    if (now < nairobiAt(now, r.hour, r.minute)) continue
    const key = `pt-till-remind-${nairobiYYMMDD(now)}-${r.key}`
    try {
      if (localStorage.getItem(key)) continue
      localStorage.setItem(key, "1")
    } catch {
      // private mode: remind anyway, at most once per page load
    }
    toast.warning(r.body(pendingSales), { id: `till-remind-${r.key}`, duration: 20_000 })
    void notifyDesktop(r.title, r.body(pendingSales))
  }
}

export function TillRunner({ onOpenSync }: { onOpenSync?: () => void }) {
  const qc = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const wasOffline = useRef(false)

  useEffect(() => {
    setTillSession(profile ? { organizationId: profile.organization_id, userId: profile.id, name: profile.full_name, role: profile.role } : null)
    void refreshTillState()
  }, [profile])

  useEffect(() => {
    let alive = true
    const registered = () => useTillStore.getState().registered && !useTillStore.getState().wrongOrg
    const run = (reason: string, force = false) => {
      if (alive && registered() && navigator.onLine) void syncNow(reason, { force })
    }

    void tickClock().then(() => run("start"))
    // Keep this page + its scripts in the offline cache (the worker may not
    // have been in control when the till first loaded).
    const warm = window.setTimeout(() => void warmTillShell().catch(() => {}), 5000)
    deferSyncWhile(() => useCartStore.getState().items.length > 0)
    const unsubCart = useCartStore.subscribe(() => noteTillActivity())

    const onOnline = () => {
      setTillOnline(true)
      run("reconnect", true)
    }
    const onOffline = () => {
      setTillOnline(false)
      wasOffline.current = true
      if (registered()) toast.info("You're offline — keep selling. Sales are saved on this computer and upload when the internet is back.", { id: "till-offline" })
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void tickClock()
        run("visible")
      }
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    document.addEventListener("visibilitychange", onVisible)
    const minute = window.setInterval(() => void tickClock().then(() => remindIfDue()), 60_000)
    const poll = window.setInterval(() => run("poll"), POLL_MS)

    const unsubResult = onSyncResult((r) => {
      if (r.outcome === "synced" || r.outcome === "partial") {
        if (r.pushed > 0 || r.productsUpdated > 0) {
          for (const key of ["inventory", "dashboard", "reports", "shift-summary", "productSearch", "topProducts"]) {
            void qc.invalidateQueries({ queryKey: [key] })
          }
        }
        if (wasOffline.current && r.pushed > 0) {
          toast.success(`Back online — ${r.pushed} item${r.pushed === 1 ? "" : "s"} uploaded.`, { id: "till-offline" })
        }
        wasOffline.current = false
      }
      if (r.rejected > 0) {
        toast.error(`${r.rejected} sale${r.rejected === 1 ? "" : "s"} couldn't be uploaded and need${r.rejected === 1 ? "s" : ""} a manager's attention.`, {
          id: "till-rejected",
          duration: 12_000,
          ...(onOpenSync ? { action: { label: "Review", onClick: onOpenSync } } : {}),
        })
      }
      if (r.outcome === "revoked" || r.outcome === "subscription") {
        toast.error(r.message ?? "Sync stopped.", { id: "till-stopped", duration: 15_000 })
      }
    })

    return () => {
      alive = false
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      document.removeEventListener("visibilitychange", onVisible)
      window.clearInterval(minute)
      window.clearInterval(poll)
      window.clearTimeout(warm)
      unsubCart()
      unsubResult()
    }
  }, [qc, onOpenSync])

  return null
}
