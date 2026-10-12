"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import Link from "next/link"
import { Smartphone, Tablet, Loader2, ShieldOff, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"

interface DeviceRow {
  id: string; name: string; code: string; branch_name: string | null; platform: string | null; app_version: string | null
  allocation_percent: number | null; last_seen_at: string | null; last_sync_at: string | null; revoked_at: string | null
  created_at: string; units_held: number; open_issues: number
}

const ago = (iso: string | null) => {
  if (!iso) return "never"
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}
// Synced since the start of today (Nairobi)? Otherwise it has missed tonight's deadline risk.
const syncedToday = (iso: string | null) =>
  !!iso && new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(iso)) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date())

/** Settings → Devices: phones/tablets registered for offline selling. */
export function DevicesPanel() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<string | null>(null)
  const [share, setShare] = useState("")
  const { data, isLoading } = useQuery<{ devices: DeviceRow[] }>({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await fetch("/api/devices")
      if (!res.ok) throw new Error("Failed to load devices")
      return res.json() as Promise<{ devices: DeviceRow[] }>
    },
    refetchInterval: 60_000,
  })

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    const res = await fetch(`/api/devices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const json = (await res.json()) as { error?: string }
    if (!res.ok) { toast.error(json.error ?? "Failed"); return }
    toast.success(ok)
    setEditing(null)
    void qc.invalidateQueries({ queryKey: ["devices"] })
  }

  async function revoke(d: DeviceRow) {
    const yes = await confirm(`${d.name} (${d.code}) will stop syncing and selling offline immediately. Sales already on it that haven't synced will be stuck until it's registered again.`, {
      title: "Remove this device?", confirmLabel: "Remove device",
    })
    if (yes) await patch(d.id, { revoke: true }, `${d.name} removed`)
  }

  if (isLoading) return <div className="max-w-3xl space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />)}</div>
  const devices = (data?.devices ?? []).filter((d) => !d.revoked_at)

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-bold">Selling devices</h2>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
          Phones and tablets registered here can sell offline all day. Each gets its own share of branch stock, so devices
          can never sell more than you have, and must sync before midnight. To add one, sign in on the phone as an owner
          or manager and tap <span className="font-semibold">Register this device</span>.
        </p>
      </div>

      {devices.length === 0 ? (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] py-10 text-center text-sm text-[var(--pt-text-secondary)]">
          No devices registered yet.
        </div>
      ) : (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] divide-y divide-[var(--pt-border)]">
          {devices.map((d) => {
            const today = syncedToday(d.last_sync_at)
            const Icon = d.name.toLowerCase().includes("tablet") ? Tablet : Smartphone
            return (
              <div key={d.id} className="px-4 sm:px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-secondary)] shrink-0"><Icon size={17} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{d.name}</span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]">{d.code}</span>
                      {d.open_issues > 0 && (
                        <Link href="/sync-issues" className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          <AlertTriangle size={11} /> {d.open_issues} issue{d.open_issues === 1 ? "" : "s"}
                        </Link>
                      )}
                    </div>
                    <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
                      {d.branch_name ?? "—"} · last sync{" "}
                      <span className={today ? "text-[var(--pt-green-600)] font-semibold" : "text-amber-700 dark:text-amber-300 font-semibold"}>
                        {ago(d.last_sync_at)}
                      </span>
                      {" "}· holding {d.units_held.toLocaleString()} units
                      {d.app_version ? ` · v${d.app_version}` : ""}
                    </p>
                    <p className="text-xs mt-1 flex items-center gap-1 text-[var(--pt-text-tertiary)]">
                      {today ? <CheckCircle2 size={11} className="text-[var(--pt-green)]" /> : <AlertTriangle size={11} className="text-amber-500" />}
                      {today ? "Synced today" : "Not synced today — must sync before midnight"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-[var(--pt-red)]" onClick={() => revoke(d)}><ShieldOff size={14} /> Remove</Button>
                </div>
                <div className="mt-3 ml-12 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[var(--pt-text-secondary)]">Stock share:</span>
                  {editing === d.id ? (
                    <>
                      <Input type="number" min={0} max={100} value={share} onChange={(e) => setShare(e.target.value)} placeholder="%" className="h-8 w-20" autoFocus />
                      <Button size="sm" onClick={() => patch(d.id, { allocation_percent: share === "" ? null : Number(share) }, "Stock share updated — applies at its next sync")}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => patch(d.id, { allocation_percent: null }, "Back to automatic")}>Automatic</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </>
                  ) : (
                    <button onClick={() => { setEditing(d.id); setShare(d.allocation_percent == null ? "" : String(d.allocation_percent)) }}
                      className="font-semibold text-[var(--pt-green-600)] hover:underline">
                      {d.allocation_percent == null ? "Automatic (by recent sales)" : `${d.allocation_percent}% fixed`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {isLoading && <Loader2 className="animate-spin" size={16} />}
    </div>
  )
}
