"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, Monitor, Printer, RefreshCw, UploadCloud } from "lucide-react"
import { countdown, nairobiClock, timeAgo } from "@pharmatrack/core/sync"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { syncNow } from "@/lib/till/engine"
import { dismissRejected, listOutbox } from "@/lib/till/outbox"
import { useTillStore } from "@/lib/till/store"
import type { OutboxRow } from "@/lib/till/db"

// Header pill + side panel for a registered till: what's waiting, what the
// server refused (kept until someone marks it handled — never deleted), what
// went up recently (with reprint), and a big "Sync now".

/** Compact status in the POS header; click opens the sync panel. */
export function TillStatusPill({ onOpen }: { onOpen: () => void }) {
  const { online, status, pendingCount, rejectedCount, lastSyncAt, progress } = useTillStore()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  let tone = "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
  let icon = <CheckCircle2 size={13} />
  let label = lastSyncAt ? `Synced ${timeAgo(lastSyncAt)}` : "Synced"
  if (status === "syncing") {
    tone = "bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]"
    icon = <Loader2 size={13} className="animate-spin" />
    label = progress?.label ?? "Syncing…"
  } else if (rejectedCount > 0) {
    tone = "bg-[var(--pt-red-50)] text-[var(--pt-red)]"
    icon = <AlertTriangle size={13} />
    label = `${rejectedCount} need${rejectedCount === 1 ? "s" : ""} attention`
  } else if (!online || status === "offline") {
    tone = "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
    icon = <CloudOff size={13} />
    label = pendingCount > 0 ? `Offline · ${pendingCount} waiting` : "Offline"
  } else if (status === "error" || status === "revoked") {
    tone = "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
    icon = <AlertTriangle size={13} />
    label = pendingCount > 0 ? `${pendingCount} waiting to upload` : "Sync problem"
  } else if (pendingCount > 0) {
    tone = "bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]"
    icon = <UploadCloud size={13} />
    label = `${pendingCount} waiting`
  }

  return (
    <button
      onClick={onOpen}
      title="Offline selling — open the sync panel"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80 ${tone}`}
    >
      {icon}
      <span className="hidden sm:inline max-w-[180px] truncate">{label}</span>
    </button>
  )
}

function Row({ r, action }: { r: OutboxRow; action?: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--pt-border)] last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{r.summary}</p>
        <p className="text-xs text-[var(--pt-text-secondary)]">
          {nairobiClock(r.created_at)} · {timeAgo(r.created_at)}
          {r.status === "pending" && r.error_message ? ` · ${r.error_message}` : ""}
        </p>
        {r.status === "rejected" && r.error_message && (
          <p className="text-xs text-[var(--pt-red)] mt-0.5">{r.error_message}</p>
        )}
      </div>
      {action}
    </li>
  )
}

export function TillSyncSheet({ open, onOpenChange, onReprint }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onReprint?: (row: OutboxRow) => void
}) {
  const s = useTillStore()
  const confirm = useConfirm()
  const [lists, setLists] = useState<{ pending: OutboxRow[]; rejected: OutboxRow[]; synced: OutboxRow[] }>({ pending: [], rejected: [], synced: [] })

  useEffect(() => {
    if (!open) return
    let alive = true
    void Promise.all([listOutbox("pending"), listOutbox("rejected"), listOutbox("synced", 30)]).then(([pending, rejected, synced]) => {
      if (alive) setLists({ pending, rejected, synced })
    })
    return () => {
      alive = false
    }
  }, [open, s.pendingCount, s.rejectedCount, s.dataVersion])

  async function runNow() {
    if (!navigator.onLine) {
      toast.error("You're offline. Sales stay saved on this computer — sync when the internet is back.")
      return
    }
    const r = await syncNow("manual", { force: true })
    if (r.ok) toast.success(r.pushed > 0 ? `Synced — ${r.pushed} item${r.pushed === 1 ? "" : "s"} uploaded.` : "Everything is up to date.")
    else toast.error(r.message ?? "Sync didn't finish. Try again in a moment.")
  }

  async function markHandled(r: OutboxRow) {
    const ok = await confirm(
      "Only do this after the sale has been recorded by hand (cash counted, stock adjusted). It stays in the history but stops showing as a problem.",
      { title: "Mark as handled?", confirmLabel: "Mark handled" },
    )
    if (!ok || r.seq == null) return
    await dismissRejected(r.seq)
    useTillStore.setState((st) => ({ rejectedCount: Math.max(0, st.rejectedCount - 1) }))
    toast.success("Marked as handled.")
  }

  const syncing = s.status === "syncing"
  const reprintable = (r: OutboxRow) => r.type === "sale" && onReprint

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-[var(--pt-border)]">
          <SheetTitle className="flex items-center gap-2"><Monitor size={17} /> Offline selling</SheetTitle>
          <SheetDescription>
            {s.device ? `${s.device.name} (${s.device.code}) · ${s.branch?.name ?? s.device.branchName ?? "branch"}` : "This computer"}
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl border border-[var(--pt-border)] p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--pt-text-secondary)]">Connection</span><span className="font-semibold">{s.online ? "Online" : "Offline"}</span></div>
            <div className="flex justify-between"><span className="text-[var(--pt-text-secondary)]">Last synced</span><span className="font-semibold">{timeAgo(s.lastSyncAt)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--pt-text-secondary)]">Waiting to upload</span><span className="font-semibold tabular-nums">{s.pendingCount}</span></div>
            {s.deadline && (
              <div className="flex justify-between">
                <span className="text-[var(--pt-text-secondary)]">Sync before</span>
                <span className="font-semibold">midnight{s.lock.msToDeadline != null && s.lock.msToDeadline > 0 ? ` (${countdown(s.lock.msToDeadline)} left)` : ""}</span>
              </div>
            )}
            {s.progress && <p className="text-xs text-[var(--pt-text-secondary)] pt-1">{s.progress.label}</p>}
            {s.lastError && <p className="text-xs text-amber-700 dark:text-amber-300 pt-1">{s.lastError}</p>}
          </div>

          <Button onClick={() => void runNow()} disabled={syncing} className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold gap-2">
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
          <p className="text-xs text-[var(--pt-text-tertiary)]">
            Sales upload automatically a few seconds after each sale and whenever the internet comes back. Sync at least once a day — selling locks at midnight until this computer has synced.
          </p>

          {lists.rejected.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--pt-red)] mb-1">Needs attention</h3>
              <p className="text-xs text-[var(--pt-text-secondary)] mb-2">The server refused these. The customer was served — record them by hand, then mark them handled.</p>
              <ul>{lists.rejected.map((r) => <Row key={r.seq} r={r} action={<Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => void markHandled(r)}>Handled</Button>} />)}</ul>
            </section>
          )}

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--pt-text-secondary)] mb-1">Waiting to upload</h3>
            {lists.pending.length === 0
              ? <p className="text-sm text-[var(--pt-text-tertiary)] py-2">Nothing waiting — all sales are on the server.</p>
              : <ul>{lists.pending.map((r) => <Row key={r.seq} r={r} action={reprintable(r) ? <ReprintButton onClick={() => onReprint!(r)} /> : null} />)}</ul>}
          </section>

          {lists.synced.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--pt-text-secondary)] mb-1">Recently uploaded</h3>
              <ul>{lists.synced.map((r) => <Row key={r.seq} r={r} action={reprintable(r) ? <ReprintButton onClick={() => onReprint!(r)} /> : null} />)}</ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ReprintButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Reprint receipt" aria-label="Reprint receipt" className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)]">
      <Printer size={14} />
    </button>
  )
}
