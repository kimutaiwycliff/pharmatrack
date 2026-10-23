"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CloudOff, Monitor } from "lucide-react"
import { timeAgo } from "@pharmatrack/core/sync"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useCan, useSessionStore } from "@/lib/store/sessionStore"
import { forgetThisComputer, isDesktopApp } from "@/lib/till/device"
import { refreshTillState, setTillSession } from "@/lib/till/engine"
import { useTillStore } from "@/lib/till/store"
import { SetupTillDialog } from "./SetupTill"

// Settings → Devices: offline selling on the computer you're using right now.

export function ThisComputerCard({ onChanged }: { onChanged: () => void }) {
  const profile = useSessionStore((s) => s.profile)
  const canManage = useCan("devices.manage")
  const confirm = useConfirm()
  const { ready, registered, wrongOrg, device, lastSyncAt, pendingCount } = useTillStore()
  const [setupOpen, setSetupOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const what = isDesktopApp() ? "this desktop app" : "this browser"

  useEffect(() => {
    if (profile) setTillSession({ organizationId: profile.organization_id, userId: profile.id, name: profile.full_name, role: profile.role })
    void refreshTillState()
  }, [profile])

  async function turnOff() {
    if (!device) return
    const ok = await confirm(
      `Offline selling will stop on ${what} and its local copy of products and sales history is deleted. The device is also removed from your list, so its stock share goes back to the branch.`,
      { title: "Turn off offline selling here?", confirmLabel: "Turn off" },
    )
    if (!ok) return
    setBusy(true)
    const r = await forgetThisComputer()
    if (!r.ok) {
      setBusy(false)
      toast.error(r.error)
      return
    }
    // Best effort: release its stock share on the server too.
    await fetch(`/api/devices/${device.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revoke: true }) }).catch(() => null)
    setBusy(false)
    toast.success("Offline selling turned off on this computer.")
    onChanged()
  }

  if (!ready) return null
  return (
    <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] px-4 sm:px-5 py-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-[var(--pt-green-50)] flex items-center justify-center text-[var(--pt-green-600)] shrink-0">
        {registered && !wrongOrg ? <Monitor size={17} /> : <CloudOff size={17} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">This computer</p>
        {registered && !wrongOrg && device ? (
          <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
            Selling offline as <span className="font-semibold">{device.name} ({device.code})</span> · last sync {timeAgo(lastSyncAt)}
            {pendingCount > 0 ? ` · ${pendingCount} waiting to upload — open the POS to sync` : ""}
          </p>
        ) : wrongOrg ? (
          <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">Set up for another pharmacy, so offline selling is off while you&apos;re signed in here.</p>
        ) : (
          <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
            Not set up. Turn on offline selling so the till on {what} keeps working when the internet drops.
          </p>
        )}
      </div>
      {canManage && !wrongOrg && (registered ? (
        <div className="flex gap-2 shrink-0">
          <Link href="/pos"><Button size="sm" variant="outline">Open POS</Button></Link>
          <Button size="sm" variant="ghost" className="text-[var(--pt-red)]" disabled={busy} onClick={() => void turnOff()}>Turn off</Button>
        </div>
      ) : (
        <Button size="sm" onClick={() => setSetupOpen(true)} className="shrink-0 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">Set up</Button>
      ))}
      <SetupTillDialog open={setupOpen} onOpenChange={(o) => { setSetupOpen(o); if (!o) onChanged() }} />
    </div>
  )
}
