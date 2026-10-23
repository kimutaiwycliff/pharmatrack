"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, CloudOff, Loader2, Monitor, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useCan, useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { isDesktopApp, registerThisComputer } from "@/lib/till/device"
import { syncNow } from "@/lib/till/engine"
import { useTillStore } from "@/lib/till/store"

// "Set up this computer for offline selling" — registers this browser / the
// desktop app as a selling device. Owners and managers only (devices.manage).

const DISMISS_KEY = "pt-till-setup-dismissed"
const DISMISS_DAYS = 7

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

/** POS banner inviting a manager to turn on offline selling here. */
export function OfflineSetupBanner({ onSetUp }: { onSetUp: () => void }) {
  const canManage = useCan("devices.manage")
  const { ready, registered } = useTillStore()
  const [hidden, setHidden] = useState(dismissedRecently)
  if (!ready || registered || !canManage || hidden) return null
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 text-sm bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-b border-[var(--pt-border)]">
      <CloudOff size={16} className="shrink-0" />
      <span className="flex-1 min-w-0">
        <strong className="font-semibold">Keep selling when the internet drops.</strong>{" "}
        <span className="hidden md:inline">Set up this {isDesktopApp() ? "desktop app" : "computer"} for offline selling — shifts, receipts and stock all work without a connection.</span>
      </span>
      <Button size="sm" onClick={onSetUp} className="h-8 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">Set up</Button>
      <button
        aria-label="Not now"
        title="Not now"
        onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* private mode */ }
          setHidden(true)
        }}
        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-black/5"
      >
        <X size={15} />
      </button>
    </div>
  )
}

export function SetupTillDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  const [name, setName] = useState(isDesktopApp() ? "Desktop till" : "Counter computer")
  const [branchId, setBranchId] = useState(branches.find((b) => b.id === activeBranchId)?.id ?? profile?.branch_id ?? branches[0]?.id ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (name.trim().length < 2) {
      setError("Give this computer a name, e.g. “Front counter”.")
      return
    }
    if (!profile) return
    setBusy(true)
    setError("")
    const r = await registerThisComputer({ name, branchId: branchId || null, organizationId: profile.organization_id })
    if (!r.ok) {
      setBusy(false)
      setError(r.error)
      return
    }
    onOpenChange(false)
    setBusy(false)
    const id = toast.loading(`${r.device.name} (${r.device.code}) is set up — downloading products and stock…`)
    const s = await syncNow("setup", { force: true })
    if (s.ok) toast.success("Ready — this computer can now sell offline.", { id })
    else toast.error(s.message ?? "Set up, but the first download didn't finish. Press Sync now to try again.", { id })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Monitor size={18} /> Set up offline selling</DialogTitle>
          <DialogDescription>This computer keeps a copy of the product list, stock and staff, so the till keeps working when the internet drops.</DialogDescription>
        </DialogHeader>
        <ul className="text-sm space-y-1.5 text-[var(--pt-text-secondary)]">
          {[
            "Sales, shifts and receipts work with no internet and upload automatically.",
            "It never sells more than this computer's share of the branch stock.",
            "Cashiers can switch with their PIN, even offline.",
            "Sync once a day — selling pauses at midnight until it has synced.",
          ].map((t) => (
            <li key={t} className="flex gap-2"><CheckCircle2 size={15} className="text-[var(--pt-green)] shrink-0 mt-0.5" />{t}</li>
          ))}
        </ul>
        <div className="space-y-3 pt-1">
          <div>
            <Label htmlFor="till-name" className="text-sm font-medium">Name this computer</Label>
            <Input id="till-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} className="mt-1.5 h-11" autoFocus />
          </div>
          {branches.length > 1 && (
            <div>
              <Label htmlFor="till-branch" className="text-sm font-medium">Sells for branch</Label>
              <select id="till-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-[var(--pt-border)] px-3 bg-[var(--pt-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button onClick={() => void submit()} disabled={busy} className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Set up"}
            </Button>
          </div>
          <p className="text-xs text-[var(--pt-text-tertiary)]">You can see and remove it any time in Settings → Devices.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
