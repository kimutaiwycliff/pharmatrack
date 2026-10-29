"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ShieldCheck, Loader2, CheckCircle2, XCircle, KeyRound, Smartphone, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { APPROVAL_DURATIONS, DEVICE_PURPOSES, formatPairingCode, type ApprovalDuration, type DevicePurpose } from "@pharmatrack/core"
import { isDesktopApp, saveTillRegistration } from "@/lib/till/device"

// Shown instead of the sign-in form when the pharmacy only allows approved
// devices and this one isn't (ADR-018). The owner (or a manager, if the
// pharmacy allows it) approves it here with their PIN, or from Settings → Devices after checking the code. The
// screen polls and continues by itself.

export interface DeviceRequestInfo { id: string; code: string; secret: string; expires_at: string }

interface Context {
  pharmacy: string
  requester: { name: string; role: string | null }
  suggested_name: string
  platform: string | null
  default_branch_id: string | null
  branches: { id: string; name: string }[]
  approvers: { id: string; name: string; role: string }[]
}
interface ApprovedDevice { id: string; name: string; code: string; branch_id: string; branch_name: string | null; purpose: DevicePurpose; organization_id: string }

type Phase = "pending" | "approved" | "declined" | "expired"

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", pharmacist: "Pharmacist", cashier: "Cashier" }
const platform = () => (isDesktopApp() ? "desktop" : "web")

function useCountdown(iso: string) {
  const [left, setLeft] = useState(() => new Date(iso).getTime() - Date.now())
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(iso).getTime() - Date.now()), 1000)
    return () => clearInterval(t)
  }, [iso])
  const s = Math.max(0, Math.floor(left / 1000))
  return { done: s === 0, label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` }
}

export function DeviceApproval({ request, onApproved, onCancel }: {
  request: DeviceRequestInfo
  /** Retry the sign-in now that this device is approved. */
  onApproved: () => Promise<void>
  onCancel: () => void
}) {
  const [phase, setPhase] = useState<Phase>("pending")
  const [ctx, setCtx] = useState<Context | null>(null)
  const [mode, setMode] = useState<"here" | "remote">("here")
  const finishing = useRef(false)
  const pharmacy = useRef<string | undefined>(undefined)
  const countdown = useCountdown(request.expires_at)

  const finish = useCallback(async (device: ApprovedDevice) => {
    if (finishing.current) return
    finishing.current = true
    setPhase("approved")
    if (device.purpose === "till") {
      // The approval secret is now this computer's key — start the offline till with it.
      await saveTillRegistration(request.secret, {
        id: device.id, name: device.name, code: device.code, branchId: device.branch_id, branchName: device.branch_name,
        organizationId: device.organization_id, organizationName: pharmacy.current ?? null,
      }).catch(() => undefined)
    }
    await onApproved()
  }, [onApproved, request.secret])

  const poll = useCallback(async () => {
    if (finishing.current) return
    try {
      const res = await fetch("/api/device-pairing/status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: request.secret, platform: platform() }),
      })
      const body = (await res.json().catch(() => ({}))) as { status?: string; context?: Context; device?: ApprovedDevice }
      if (body.status === "pending" && body.context) {
        pharmacy.current = body.context.pharmacy
        setCtx(body.context)
      } else if (body.status === "approved" && body.device) await finish(body.device)
      else if (body.status === "declined") setPhase("declined")
      else if (body.status === "expired" || body.status === "unknown" || body.status === "revoked") setPhase("expired")
    } catch {
      // offline for a moment — keep trying
    }
  }, [request.secret, finish])

  useEffect(() => {
    if (phase !== "pending") return
    const first = setTimeout(() => void poll(), 0)
    const t = setInterval(() => void poll(), 3000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [poll, phase])

  const noApprovers = !!ctx && ctx.approvers.length === 0
  const shownMode = noApprovers ? "remote" : mode
  const phaseShown: Phase = countdown.done && phase === "pending" ? "expired" : phase

  if (phaseShown === "approved") {
    return (
      <Shell>
        <div className="text-center py-6">
          <CheckCircle2 size={44} className="mx-auto text-[var(--pt-green)]" />
          <h1 className="text-xl font-bold mt-3">Device approved</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-1 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Signing you in…</p>
        </div>
      </Shell>
    )
  }

  if (phaseShown === "declined" || phaseShown === "expired") {
    return (
      <Shell>
        <div className="text-center py-4">
          <XCircle size={44} className="mx-auto text-[var(--pt-text-tertiary)]" />
          <h1 className="text-xl font-bold mt-3">{phaseShown === "declined" ? "Approval was declined" : "The approval request expired"}</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-1">
            {phaseShown === "declined" ? "Ask the owner if you think this device should be allowed." : "Sign in again to get a new code."}
          </p>
          <Button className="mt-5 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white" onClick={onCancel}>Back to sign in</Button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0"><ShieldCheck size={22} /></div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">This device needs approval</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-1">
            {ctx ? <><span className="font-semibold text-[var(--pt-text)]">{ctx.pharmacy}</span> only lets staff use approved devices.</> : "Your pharmacy only lets staff use approved devices."}
            {" "}{ctx && ctx.approvers.some((a) => a.role !== "owner") ? "Ask the owner or a manager to approve it." : "Ask the owner to approve it."}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-[var(--pt-muted)] p-4 text-center">
        <p className="text-xs font-medium text-[var(--pt-text-secondary)]">Approval code</p>
        <p className="font-mono text-4xl font-bold tracking-[0.18em] mt-1" aria-live="polite">{formatPairingCode(request.code)}</p>
        <p className="text-xs text-[var(--pt-text-tertiary)] mt-1">Expires in {countdown.label}</p>
      </div>

      <div className="grid grid-cols-2 bg-[var(--pt-muted-strong)] rounded-lg p-1 mt-5" role="tablist">
        {([["here", "Approve here", KeyRound], ["remote", "From their phone", Smartphone]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={shownMode === k} onClick={() => setMode(k)}
            className={`h-9 rounded-md text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${shownMode === k ? "bg-[var(--pt-surface)] text-[var(--pt-text)] shadow-sm" : "text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {shownMode === "here"
        ? <ApproveHere request={request} ctx={ctx} onApproved={(d) => void finish(d)} />
        : (
          <div className="mt-4 text-sm text-[var(--pt-text-secondary)] space-y-3">
            {noApprovers && <p>Nobody who can approve devices has a till PIN set yet, so approve this device from their phone or computer:</p>}
            <p>We&apos;ve emailed the owner about this device.</p>
            <ol className="list-decimal ml-5 space-y-1.5">
              <li>The owner opens <span className="font-semibold text-[var(--pt-text)]">Settings → Devices</span> on their phone or computer.</li>
              <li>Under <span className="font-semibold text-[var(--pt-text)]">Waiting for approval</span>, they check the code matches, enter their PIN and tap <span className="font-semibold text-[var(--pt-text)]">Approve</span>.</li>
            </ol>
            <p className="flex items-center gap-2 text-[var(--pt-text)]"><Loader2 size={14} className="animate-spin text-[var(--pt-green)]" /> Waiting — this screen continues by itself.</p>
          </div>
        )}

      <div className="mt-6 flex items-center justify-between gap-3 text-xs">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 font-medium text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">
          <ArrowLeft size={13} /> Back
        </button>
        <span className="text-[var(--pt-text-tertiary)] text-right">Clearing this browser&apos;s data means approving it again.</span>
      </div>
    </Shell>
  )
}

function ApproveHere({ request, ctx, onApproved }: { request: DeviceRequestInfo; ctx: Context | null; onApproved: (d: ApprovedDevice) => void }) {
  const [approverId, setApproverId] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [purpose, setPurpose] = useState<DevicePurpose>("till")
  const [branchId, setBranchId] = useState<string | null>(null)
  const [pin, setPin] = useState("")
  const [duration, setDuration] = useState<ApprovalDuration>("always")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!ctx) return <div className="mt-4 h-40 rounded-lg bg-[var(--pt-muted-strong)] animate-pulse" />
  // Defaults come from the request until the approver changes them.
  const approver = approverId ?? ctx.approvers[0]?.id ?? ""
  const deviceName = name ?? ctx.suggested_name
  const branch = branchId ?? ctx.default_branch_id ?? ctx.branches[0]?.id ?? ""
  const approverName = ctx.approvers.find((a) => a.id === approver)?.name ?? "Approver"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await fetch("/api/device-pairing/approve-pin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: request.secret, approver_id: approver, pin, name: deviceName.trim(), branch_id: branch, purpose, duration, platform: platform() }),
    }).catch(() => null)
    const body = (await res?.json().catch(() => ({})) ?? {}) as { error?: string; device?: ApprovedDevice }
    if (!res || !res.ok || !body.device) {
      setError(res ? body.error ?? "Couldn't approve this device." : "No internet connection. Approving a device needs to be online once.")
      setPin("")
      setBusy(false)
      return
    }
    onApproved(body.device)
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <fieldset>
        <legend className="text-sm font-medium">Who is approving?</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {ctx.approvers.map((a) => (
            <button key={a.id} type="button" onClick={() => setApproverId(a.id)} aria-pressed={approver === a.id}
              className={`px-3 h-9 rounded-lg border text-sm transition-colors ${approver === a.id ? "border-[var(--pt-green)] bg-[var(--pt-green-50)] font-semibold" : "border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"}`}>
              {a.name} <span className="text-xs text-[var(--pt-text-tertiary)]">· {ROLE_LABEL[a.role] ?? a.role}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="dev-name" className="text-sm font-medium">Name this device</label>
        <Input id="dev-name" value={deviceName} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front counter PC" maxLength={60} className="mt-1.5 h-11" required />
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Used as</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(Object.keys(DEVICE_PURPOSES) as DevicePurpose[]).map((p) => (
            <button key={p} type="button" onClick={() => setPurpose(p)} aria-pressed={purpose === p}
              className={`text-left rounded-lg border p-2.5 transition-colors ${purpose === p ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]" : "border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"}`}>
              <span className="block text-sm font-semibold">{DEVICE_PURPOSES[p].label}</span>
              <span className="block text-[11px] leading-snug text-[var(--pt-text-secondary)] mt-0.5">{DEVICE_PURPOSES[p].description}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Approved for</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {(["always", "week", "today"] as ApprovalDuration[]).map((d) => (
            <button key={d} type="button" onClick={() => setDuration(d)} aria-pressed={duration === d}
              className={`text-left rounded-lg border p-2.5 transition-colors ${duration === d ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]" : "border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"}`}>
              <span className="block text-sm font-semibold">{APPROVAL_DURATIONS[d].label}</span>
              <span className="block text-[11px] leading-snug text-[var(--pt-text-secondary)] mt-0.5">{APPROVAL_DURATIONS[d].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {ctx.branches.length > 1 && (
        <div>
          <label htmlFor="dev-branch" className="text-sm font-medium">Branch</label>
          <select id="dev-branch" value={branch} onChange={(e) => setBranchId(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] px-3 text-sm">
            {ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="dev-pin" className="text-sm font-medium">{approverName}&apos;s till PIN</label>
        <Input id="dev-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" className="mt-1.5 h-11 tracking-[0.5em] text-center text-lg" required />
      </div>
      {error && <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg" role="alert">{error}</p>}
      <Button type="submit" disabled={busy || pin.length < 4 || !approver || deviceName.trim().length < 2 || !branch}
        className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
        {busy ? "Approving…" : "Approve this device"}
      </Button>
    </form>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="w-full bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] shadow-sm p-6 sm:p-8">{children}</div>
}
