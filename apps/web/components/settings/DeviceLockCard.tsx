"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Lock, LockOpen, Smartphone, Monitor, Clock, Check, X, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { APPROVAL_DURATIONS, DEVICE_USES, formatPairingCode, type ApprovalDuration, type DeviceLockSettings, type DeviceUse } from "@pharmatrack/core"

// Settings → Devices: the "Only approved devices" switch (ADR-018) and the
// devices waiting for approval.

interface Summary {
  tills: number; office: number; pending: number; android_old: number; android_min_version: string
  unapproved_now: { sessions: number; staff: number }
  unapproved_if: { managers_locked: { sessions: number; staff: number }; managers_exempt: { sessions: number; staff: number } }
}
interface PendingRequest {
  id: string; code: string; suggested_name: string; platform: string | null; branch_id: string | null
  created_at: string; expires_at: string; requester_name: string; requester_role: string | null
}
interface Branch { id: string; name: string }

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", pharmacist: "Pharmacist", cashier: "Cashier" }
const minsLeft = (iso: string) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000))
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? "Something went wrong")
  return body
}

export function DeviceLockCard({ branches }: { branches: Branch[] }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState<PendingRequest | null>(null)

  const lockQ = useQuery<{ lock: DeviceLockSettings; can_edit: boolean; summary: Summary }>({
    queryKey: ["device-lock"],
    queryFn: async () => json(await fetch("/api/settings/device-lock")),
  })
  const reqQ = useQuery<{ requests: PendingRequest[] }>({
    queryKey: ["device-requests"],
    queryFn: async () => json(await fetch("/api/device-requests")),
    refetchInterval: 10_000, // someone may be standing at a till waiting
  })

  const lock = lockQ.data?.lock
  const s = lockQ.data?.summary
  const canEdit = lockQ.data?.can_edit ?? false
  const requests = reqQ.data?.requests ?? []

  async function save(next: DeviceLockSettings) {
    if (!s || !lock) return
    const widening = next.enabled && (!lock.enabled || (lock.managers_exempt && !next.managers_exempt))
    if (widening) {
      const affected = next.managers_exempt ? s.unapproved_if.managers_exempt : s.unapproved_if.managers_locked
      const lines = [
        affected.staff > 0
          ? `${people(affected.staff)} signed in on devices that aren't approved will be signed out. Next time they sign in, they'll see a screen to get the device approved — you can approve it with your PIN on the spot, or from here.`
          : "Nobody will be signed out — everyone it applies to is already on an approved device.",
        s.android_old > 0
          ? `${s.android_old} Android device${s.android_old === 1 ? " is" : "s are"} on an app older than v${s.android_min_version}. Staff can't sign in on ${s.android_old === 1 ? "it" : "them"} until the app is updated.`
          : null,
        "You (the owner) can always sign in anywhere.",
      ].filter(Boolean)
      const ok = await confirm(lines.join("\n\n"), { title: "Only allow approved devices?", confirmLabel: "Turn on", destructive: false })
      if (!ok) return
    }
    setSaving(true)
    try {
      const out = await json<{ signed_out: number }>(await fetch("/api/settings/device-lock", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
      }))
      toast.success(!next.enabled ? "Staff can sign in on any device again" : out.signed_out > 0
        ? `On — ${out.signed_out} session${out.signed_out === 1 ? "" : "s"} on unapproved devices signed out`
        : "Only approved devices can be used now")
      void qc.invalidateQueries({ queryKey: ["device-lock"] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function decline(r: PendingRequest) {
    const ok = await confirm(`${r.requester_name} won't be able to use "${r.suggested_name}". They can ask again by signing in on it.`, { title: "Decline this device?", confirmLabel: "Decline" })
    if (!ok) return
    try {
      await json(await fetch(`/api/device-requests/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decline" }) }))
      toast.success("Declined")
      void qc.invalidateQueries({ queryKey: ["device-requests"] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (lockQ.isLoading || !lock || !s) return <div className="h-28 rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />

  return (
    <div className="space-y-4">
      {/* The switch */}
      <div className={`rounded-xl border p-4 sm:p-5 ${lock.enabled ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]" : "border-[var(--pt-border)] bg-[var(--pt-surface)]"}`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${lock.enabled ? "bg-[var(--pt-green)] text-white" : "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]"}`}>
            {lock.enabled ? <Lock size={18} /> : <LockOpen size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h3 id="device-lock-label" className="font-semibold">Only approved devices</h3>
              <Switch checked={lock.enabled} disabled={!canEdit || saving} aria-labelledby="device-lock-label"
                onCheckedChange={(v) => void save({ ...lock, enabled: v })} />
            </div>
            <p className="text-sm text-[var(--pt-text-secondary)] mt-1">
              {lock.enabled
                ? "Staff can only sign in on the tills and computers listed below. A new device needs your approval first."
                : "When on, staff can only sign in on devices you've approved — not on personal phones or home computers."}
            </p>
            {lock.enabled && (
              <label className="mt-3 flex items-start gap-2.5 text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--pt-green)]" checked={lock.managers_exempt} disabled={!canEdit || saving}
                  onChange={(e) => void save({ ...lock, managers_exempt: e.target.checked })} />
                <span>
                  <span className="font-medium">Managers can sign in anywhere</span>
                  <span className="block text-xs text-[var(--pt-text-secondary)]">For example to check reports from home. The owner always can.</span>
                </span>
              </label>
            )}
            {lock.enabled && (
              <fieldset className="mt-3">
                <legend className="text-sm font-medium">Who can approve new devices</legend>
                <div className="mt-1.5 grid sm:grid-cols-2 gap-2">
                  {([
                    ["owner", "Only me (owner)", "Recommended. A new device needs your PIN — on that device or from here."],
                    ["owner_managers", "Me and managers", "Managers with “Manage selling devices” can approve with their own PIN."],
                  ] as const).map(([v, label, hint]) => (
                    <button key={v} type="button" disabled={!canEdit || saving} aria-pressed={lock.approvers === v}
                      onClick={() => void save({ ...lock, approvers: v })}
                      className={`text-left rounded-lg border p-3 transition-colors disabled:opacity-60 ${lock.approvers === v ? "border-[var(--pt-green)] bg-[var(--pt-surface)] ring-1 ring-[var(--pt-green)]" : "border-[var(--pt-border)] bg-[var(--pt-surface)] hover:bg-[var(--pt-muted)]"}`}>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-[var(--pt-text-secondary)] mt-0.5">{hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="text-xs text-[var(--pt-text-tertiary)] mt-3">
              {s.tills} selling till{s.tills === 1 ? "" : "s"} · {s.office} back-office device{s.office === 1 ? "" : "s"} approved
              {!canEdit && " · Only the owner can change this setting"}
            </p>
            {s.android_old > 0 && (
              <p className="text-xs mt-2 flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {s.android_old} Android device{s.android_old === 1 ? " needs" : "s need"} the app updated to v{s.android_min_version} or later before staff can sign in on {s.android_old === 1 ? "it" : "them"} with this on.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Waiting for approval */}
      {requests.length > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-[var(--pt-surface)]">
          <div className="px-4 sm:px-5 py-3 border-b border-[var(--pt-border)] flex items-center gap-2">
            <Clock size={15} className="text-amber-600" />
            <h3 className="font-semibold text-sm">Waiting for approval ({requests.length})</h3>
          </div>
          <ul className="divide-y divide-[var(--pt-border)]">
            {requests.map((r) => {
              const Icon = r.platform === "android" ? Smartphone : Monitor
              return (
                <li key={r.id} className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-secondary)] shrink-0"><Icon size={17} /></div>
                    <div className="min-w-0">
                      <p className="text-sm"><span className="font-semibold">{r.requester_name}</span>
                        <span className="text-[var(--pt-text-secondary)]"> ({ROLE_LABEL[r.requester_role ?? ""] ?? "Staff"}) wants to use </span>
                        <span className="font-semibold">{r.suggested_name}</span></p>
                      <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
                        Code <span className="font-mono font-bold text-[var(--pt-text)] tracking-wider">{formatPairingCode(r.code)}</span> · expires in {minsLeft(r.expires_at)} min
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 sm:shrink-0">
                    <Button size="sm" variant="outline" className="flex-1 sm:flex-none gap-1" onClick={() => void decline(r)}><X size={14} /> Decline</Button>
                    <Button size="sm" className="flex-1 sm:flex-none gap-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white" onClick={() => setApproving(r)}>
                      <Check size={14} /> Approve
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {approving && (
        <ApproveDialog request={approving} branches={branches} onClose={() => setApproving(null)}
          onDone={() => {
            setApproving(null)
            void qc.invalidateQueries({ queryKey: ["device-requests"] })
            void qc.invalidateQueries({ queryKey: ["devices"] })
            void qc.invalidateQueries({ queryKey: ["device-lock"] })
          }} />
      )}
    </div>
  )
}

function ApproveDialog({ request, branches, onClose, onDone }: { request: PendingRequest; branches: Branch[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(request.suggested_name)
  const [branchId, setBranchId] = useState(request.branch_id ?? branches[0]?.id ?? "")
  const [use, setUse] = useState<DeviceUse>(request.requester_role === "cashier" ? "till" : "all")
  const uses: DeviceUse[] = request.platform === "android" ? ["till", "all"] : ["till", "office", "all"]
  const [codeOk, setCodeOk] = useState(false)
  const [duration, setDuration] = useState<ApprovalDuration>("always")
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)

  async function approve() {
    setBusy(true)
    try {
      await json(await fetch(`/api/device-requests/${request.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", name: name.trim(), branch_id: branchId, purpose: DEVICE_USES[use].purpose, use, duration, pin }),
      }))
      toast.success(`${name.trim()} approved — it will continue on its own in a few seconds`)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
      setPin("")
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve this device?</DialogTitle>
          <DialogDescription>{request.requester_name} is waiting on it now.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-[var(--pt-muted)] p-3 text-center">
            <p className="text-xs text-[var(--pt-text-secondary)]">The device should be showing this code</p>
            <p className="font-mono text-3xl font-bold tracking-[0.2em] mt-1">{formatPairingCode(request.code)}</p>
            <label className="mt-2 inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4 accent-[var(--pt-green)]" checked={codeOk} onChange={(e) => setCodeOk(e.target.checked)} />
              The codes match
            </label>
          </div>
          <div>
            <label htmlFor="approve-name" className="text-sm font-medium">Device name</label>
            <Input id="approve-name" className="mt-1.5 h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front counter PC" maxLength={60} />
          </div>
          {branches.length > 1 && (
            <div>
              <label htmlFor="approve-branch" className="text-sm font-medium">Branch</label>
              <select id="approve-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] px-3 text-sm">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <fieldset>
            <legend className="text-sm font-medium">Used as</legend>
            <div className={`mt-1.5 grid ${uses.length === 3 ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
              {uses.map((p) => (
                <button key={p} type="button" onClick={() => setUse(p)} aria-pressed={use === p}
                  className={`text-left rounded-lg border p-3 transition-colors ${use === p ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]" : "border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"}`}>
                  <span className="block text-sm font-semibold">{DEVICE_USES[p].label}</span>
                  <span className="block text-xs text-[var(--pt-text-secondary)] mt-0.5">{DEVICE_USES[p].description}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Approved for</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(["always", "week", "today"] as ApprovalDuration[]).map((d) => (
                <button key={d} type="button" onClick={() => setDuration(d)} aria-pressed={duration === d}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${duration === d ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]" : "border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"}`}>
                  <span className="block text-sm font-semibold">{APPROVAL_DURATIONS[d].label}</span>
                  <span className="block text-[11px] text-[var(--pt-text-secondary)] mt-0.5">{APPROVAL_DURATIONS[d].hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="approve-pin" className="text-sm font-medium">Your PIN</label>
            <Input id="approve-pin" className="mt-1.5 h-10 tracking-[0.4em] font-mono" type="password" inputMode="numeric" autoComplete="off"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="••••" />
            <p className="text-xs text-[var(--pt-text-secondary)] mt-1">Your till PIN confirms it&apos;s you letting this device in.</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!codeOk || busy || name.trim().length < 2 || !branchId || pin.length < 4} onClick={() => void approve()}
            className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
            {busy ? <Loader2 size={15} className="animate-spin" /> : "Approve device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
