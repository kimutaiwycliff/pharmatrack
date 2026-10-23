"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Clock, KeyRound, Loader2, Lock, RefreshCw, ShieldCheck, Users } from "lucide-react"
import { countdown, lockMessage, nairobiClock } from "@pharmatrack/core/sync"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useCartStore } from "@/lib/store/cartStore"
import { refreshTillState, syncNow } from "@/lib/till/engine"
import { performOverride } from "@/lib/till/override"
import { closeShift, expectedCashCents, openShift, ShiftError } from "@/lib/till/shifts"
import { listRoster, switchStaff, verifyRosterPin } from "@/lib/till/staff"
import { useTillStore } from "@/lib/till/store"
import type { TillShift, TillStaff } from "@/lib/till/db"

// Full-screen gates and dialogs for a registered till — all of them work
// with no internet: clock in/out, switching cashier by PIN, the midnight
// lock and the manager unlock.

const kes = (cents: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(cents / 100)
const toCents = (v: string) => Math.round(parseFloat(v) * 100)

function Gate({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-[var(--pt-bg)] flex items-center justify-center px-4">
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] shadow-sm p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-[var(--pt-green-50)] flex items-center justify-center mb-3 text-[var(--pt-green)]">{icon}</div>
          <h2 className="text-lg font-bold text-center">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">{children}</p>
}

// ── PIN entry ────────────────────────────────────────────────────────────────

function PinField({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      placeholder="••••"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      onKeyDown={(e) => e.key === "Enter" && onEnter()}
      className="h-12 text-center text-2xl tracking-[0.5em] font-semibold"
      autoFocus
      aria-label="PIN"
    />
  )
}

/** Pick a person from the roster and check their PIN (offline). */
function RosterPin({ people, submitLabel, onVerified, verify }: {
  people: TillStaff[]
  submitLabel: string
  onVerified: (m: TillStaff) => void | Promise<void>
  verify?: (id: string, pin: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [who, setWho] = useState(people[0]?.id ?? "")
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!who || pin.length < 4) {
      setError("Enter the 4-digit PIN.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const r = verify ? await verify(who, pin) : await verifyRosterPin(who, pin)
      if (!r.ok) {
        setError(r.error)
        setPin("")
        return
      }
      await onVerified(people.find((p) => p.id === who)!)
    } finally {
      setBusy(false)
    }
  }

  if (people.length === 0) {
    return <p className="text-sm text-[var(--pt-text-secondary)]">Nobody on this computer&apos;s staff list can do this. Connect to the internet and sync to refresh the list.</p>
  }
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="roster-who" className="text-sm font-medium">Who</Label>
        <select
          id="roster-who"
          value={who}
          onChange={(e) => { setWho(e.target.value); setError(""); setPin("") }}
          className="mt-1.5 h-11 w-full rounded-lg border border-[var(--pt-border)] px-3 bg-[var(--pt-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
        >
          {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}{p.pin_hash ? "" : " (no PIN)"}</option>)}
        </select>
      </div>
      <PinField value={pin} onChange={(v) => { setPin(v); setError("") }} onEnter={() => void submit()} />
      {error && <ErrorText>{error}</ErrorText>}
      <Button onClick={() => void submit()} disabled={busy} className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
        {busy ? <Loader2 size={16} className="animate-spin" /> : submitLabel}
      </Button>
    </div>
  )
}

// ── Switch cashier ───────────────────────────────────────────────────────────

export function SwitchCashierDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [people, setPeople] = useState<TillStaff[] | null>(null)
  const current = useTillStore((s) => s.staff)
  useEffect(() => {
    if (open) void listRoster().then((r) => setPeople(r.filter((p) => p.permissions.includes("pos.sell"))))
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users size={17} /> Switch cashier</DialogTitle>
          <DialogDescription>Works without internet. Each person sells under their own shift.</DialogDescription>
        </DialogHeader>
        {open && people && (
          <RosterPin
            people={people.filter((p) => p.id !== current?.id)}
            submitLabel="Switch"
            onVerified={async (m) => {
              if (useCartStore.getState().items.length > 0) useCartStore.getState().clearCart()
              await switchStaff(m)
              await refreshTillState()
              onOpenChange(false)
              toast.success(`${m.name} is now selling.`)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Clock in ─────────────────────────────────────────────────────────────────

export function TillClockIn() {
  const staff = useTillStore((s) => s.staff)
  const device = useTillStore((s) => s.device)
  const [float, setFloat] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)

  async function start() {
    const cents = toCents(float || "0")
    if (!Number.isFinite(cents) || cents < 0) {
      setError("Enter a valid opening float (0 or more).")
      return
    }
    if (!staff) return
    setBusy(true)
    setError("")
    try {
      await openShift({ cashierId: staff.id, cashierName: staff.name, openingFloatCents: cents })
      await refreshTillState()
      toast.success(`Shift started · float ${kes(cents)}`)
      if (navigator.onLine) void syncNow("shift-open")
    } catch (err) {
      setError(err instanceof ShiftError ? err.message : "Couldn't start the shift. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Gate icon={<Clock size={22} />} title="Start your shift">
      <div className="space-y-4">
        <p className="text-sm text-center text-[var(--pt-text-secondary)] -mt-3">
          {staff?.name ?? "—"} · {device?.name ?? "this computer"}
          <button onClick={() => setSwitchOpen(true)} className="block mx-auto mt-1 text-[var(--pt-green-600)] font-medium hover:underline">Not you? Switch cashier</button>
        </p>
        <div>
          <Label htmlFor="till-float" className="text-sm font-medium">Opening float (KES)</Label>
          <Input id="till-float" type="number" min="0" step="50" placeholder="0" value={float}
            onChange={(e) => setFloat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void start()}
            className="mt-1.5 h-11 text-lg font-semibold" autoFocus />
          {float && Number.isFinite(toCents(float)) && <p className="text-xs text-[var(--pt-text-secondary)] mt-1">{kes(toCents(float))}</p>}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <Button onClick={() => void start()} disabled={busy || !staff} className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
          {busy ? "Starting shift…" : "Start shift"}
        </Button>
        <Link href="/dashboard" className="w-full h-11 flex items-center justify-center gap-1.5 rounded-md border border-[var(--pt-border)] text-sm font-medium text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
      </div>
      <SwitchCashierDialog open={switchOpen} onOpenChange={setSwitchOpen} />
    </Gate>
  )
}

// ── Clock out ────────────────────────────────────────────────────────────────

const duration = (from: number) => {
  const ms = Date.now() - from
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}

export function TillClockOutDialog({ open, onOpenChange, shift }: { open: boolean; onOpenChange: (o: boolean) => void; shift: TillShift }) {
  const [counted, setCounted] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const expected = expectedCashCents(shift)
  const countedCents = counted === "" ? null : toCents(counted)
  const variance = countedCents != null && Number.isFinite(countedCents) ? countedCents - expected : null

  async function end() {
    if (countedCents == null || !Number.isFinite(countedCents) || countedCents < 0) {
      setError("Count the cash in the drawer and enter the total.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const r = await closeShift({ clientId: shift.client_id, closingCashCents: countedCents, notes: notes.trim() || null })
      await refreshTillState()
      onOpenChange(false)
      const v = r.varianceCents ?? 0
      toast.success(v === 0 ? "Shift closed — the cash matches." : `Shift closed · ${v > 0 ? "over" : "short"} by ${kes(Math.abs(v))}`)
      if (navigator.onLine) {
        const s = await syncNow("shift-close", { force: true })
        if (!s.ok) toast.info("The shift is saved on this computer and will upload when the internet is back.")
      } else {
        toast.info("You're offline — the shift is saved on this computer and uploads when the internet is back.")
      }
    } catch (err) {
      setError(err instanceof ShiftError ? err.message : "Couldn't close the shift. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>End shift</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-[var(--pt-muted)] rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--pt-text-secondary)]">Duration</span><span className="font-semibold">{duration(shift.opened_at)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--pt-text-secondary)]">Sales on this computer</span><span className="font-semibold">{shift.sales_count}</span></div>
            <div className="flex justify-between"><span className="text-[var(--pt-text-secondary)]">Opening float</span><span className="font-semibold">{kes(shift.opening_float_cents)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--pt-text-secondary)]">Cash sales</span><span className="font-semibold">{kes(shift.cash_sales_cents)}</span></div>
            <div className="flex justify-between border-t border-[var(--pt-border)] pt-2"><span className="font-medium">Expected in drawer</span><span className="font-bold">{kes(expected)}</span></div>
          </div>
          <div>
            <Label htmlFor="till-counted" className="text-sm font-medium">Cash counted (KES)</Label>
            <Input id="till-counted" type="number" min="0" step="50" placeholder="0" value={counted} onChange={(e) => setCounted(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void end()} className="mt-1.5 h-11 text-lg font-semibold" autoFocus />
          </div>
          {variance !== null && (
            <div className={[
              "flex justify-between items-center px-4 py-3 rounded-lg text-sm font-semibold",
              variance === 0 ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
                : variance > 0 ? "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300" : "bg-[var(--pt-red-50)] text-[var(--pt-red)]",
            ].join(" ")}>
              <span>{variance === 0 ? "Cash matches" : variance > 0 ? "Over" : "Short"}</span>
              <span>{variance >= 0 ? "+" : "−"}{kes(Math.abs(variance))}</span>
            </div>
          )}
          {variance !== null && variance !== 0 && (
            <Input placeholder="Note (optional) — e.g. paid a supplier from the till" value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button onClick={() => void end()} disabled={busy || counted === ""} className="flex-1 bg-[var(--pt-red)] hover:bg-red-600 text-white font-semibold">
              {busy ? "Ending…" : "End shift"}
            </Button>
          </div>
          <p className="text-xs text-[var(--pt-text-tertiary)]">M-Pesa payments don&apos;t go in the drawer, so they&apos;re not counted here.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Midnight lock ────────────────────────────────────────────────────────────

export function TillLockScreen({ onSetUpAgain }: { onSetUpAgain?: () => void }) {
  const { lock, online, status, progress, lastError, pendingSales } = useTillStore()
  const [managers, setManagers] = useState<TillStaff[] | null>(null)
  const reason = lock.reason!
  const syncing = status === "syncing"

  useEffect(() => {
    if (reason === "deadline" && lock.overrideAvailable) {
      void listRoster().then((r) => setManagers(r.filter((p) => p.permissions.includes("sync.override"))))
    }
  }, [reason, lock.overrideAvailable])

  async function sync() {
    if (!navigator.onLine) {
      toast.error("Still offline. Connect this computer to the internet, then try again.")
      return
    }
    const r = await syncNow("lock-screen", { force: true })
    if (r.ok) toast.success("Synced — you can sell again.")
    else toast.error(r.message ?? "Sync didn't finish. Try again.")
  }

  const title = reason === "never_synced" ? "Getting this computer ready" : reason === "revoked" ? "This computer was removed" : "Selling is paused"
  return (
    <Gate icon={reason === "never_synced" ? <RefreshCw size={22} className={syncing ? "animate-spin" : ""} /> : <Lock size={22} />} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-center text-[var(--pt-text-secondary)] -mt-3">
          {reason === "never_synced"
            ? (online ? "Downloading the product list, stock and staff so this computer can sell without internet. This takes a moment the first time." : "Connect to the internet once so this computer can download the product list. After that it can sell offline.")
            : lockMessage(reason, "computer")}
        </p>
        {pendingSales > 0 && reason !== "never_synced" && (
          <p className="text-xs text-center text-[var(--pt-text-secondary)]">{pendingSales} sale{pendingSales === 1 ? " is" : "s are"} saved here and will upload when you sync.</p>
        )}
        {progress && <p className="text-xs text-center text-[var(--pt-text-secondary)]">{progress.label}</p>}
        {lastError && !syncing && <ErrorText>{lastError}</ErrorText>}

        {reason !== "revoked" && (
          <Button onClick={() => void sync()} disabled={syncing} className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold gap-2">
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        )}
        {reason === "revoked" && onSetUpAgain && (
          <Button onClick={onSetUpAgain} className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">Set up this computer again</Button>
        )}

        {reason === "deadline" && lock.overrideAvailable && lock.overrideUntil && (
          <div className="border-t border-[var(--pt-border)] pt-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2"><KeyRound size={15} /> No internet? A manager can unlock until {nairobiClock(lock.overrideUntil)}</p>
            {managers === null ? <Loader2 size={16} className="animate-spin mx-auto" /> : (
              <RosterPin
                people={managers}
                submitLabel="Unlock selling"
                verify={async (id, pin) => {
                  const r = await performOverride(id, pin)
                  return r.ok ? { ok: true } : r
                }}
                onVerified={(m) => {
                  toast.success(`Unlocked by ${m.name} until ${nairobiClock(lock.overrideUntil!)}. Sync as soon as the internet is back.`)
                }}
              />
            )}
          </div>
        )}

        <Link href="/dashboard" className="w-full h-10 flex items-center justify-center gap-1.5 rounded-md border border-[var(--pt-border)] text-sm font-medium text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
      </div>
    </Gate>
  )
}

// ── Banners ──────────────────────────────────────────────────────────────────

export function TillBanners({ onOpenSync }: { onOpenSync: () => void }) {
  const { lock, override, pendingSales } = useTillStore()
  if (lock.underOverride && override) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 text-xs sm:text-sm bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-b border-amber-200 dark:border-amber-500/30">
        <ShieldCheck size={15} className="shrink-0" />
        <span className="flex-1">Unlocked by {override.manager_name} until {nairobiClock(override.until)}. Connect and sync before then.</span>
        <button onClick={onOpenSync} className="font-semibold underline">Sync</button>
      </div>
    )
  }
  if (lock.warnDeadline && lock.msToDeadline != null && pendingSales > 0) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 text-xs sm:text-sm bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-b border-amber-200 dark:border-amber-500/30">
        <Clock size={15} className="shrink-0" />
        <span className="flex-1">Sync before midnight — {countdown(lock.msToDeadline)} left. {pendingSales} sale{pendingSales === 1 ? " is" : "s are"} waiting to upload.</span>
        <button onClick={onOpenSync} className="font-semibold underline">Sync now</button>
      </div>
    )
  }
  return null
}
