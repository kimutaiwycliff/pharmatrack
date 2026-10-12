"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertTriangle, BadgeDollarSign, CheckCircle2, Clock, KeyRound, Loader2, PackageX, Smartphone, UserX, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useBranchScope } from "@/lib/hooks/useBranchScope"
import { formatKES } from "@/lib/store/cartStore"

interface Issue {
  id: string; kind: string; status: string; details: Record<string, unknown>; created_at: string
  device_name: string | null; device_code: string | null; receipt: string | null; product_name: string | null; branch_name: string | null
  resolution_note: string | null; resolved_at: string | null
}

// What each kind means and what the manager should do about it.
const KINDS: Record<string, { label: string; icon: React.ElementType; tone: string; help: string; describe: (i: Issue) => string }> = {
  oversell: {
    label: "Sold more than the shelf", icon: PackageX, tone: "text-red-600 dark:text-red-400",
    help: "Stock was removed on the web (e.g. a write-off) while the device was offline and had already sold it. Recount and adjust.",
    describe: (i) => `${i.details.product_name ?? i.product_name ?? "Item"}: ${i.details.unbacked} of ${i.details.sold} sold with no stock left`,
  },
  price_mismatch: {
    label: "Different price charged", icon: BadgeDollarSign, tone: "text-amber-600 dark:text-amber-400",
    help: "The device sold at its last-synced price; the price has since changed. The sale keeps what the customer actually paid.",
    describe: (i) => `${i.details.product_name ?? "Item"}: charged ${formatKES(Number(i.details.charged_unit_price))} vs current ${formatKES(Number(i.details.current_unit_price))} × ${i.details.quantity}`,
  },
  mpesa_unverified: {
    label: "M-Pesa to confirm", icon: Smartphone, tone: "text-amber-600 dark:text-amber-400",
    help: "Recorded offline from a till/paybill code. Check it against your M-Pesa statement, then resolve.",
    describe: (i) => `${formatKES(Number(i.details.amount ?? 0))}${i.details.reference ? ` · code ${i.details.reference}` : " · no code entered"}`,
  },
  late_sync: {
    label: "Synced after midnight", icon: Clock, tone: "text-amber-600 dark:text-amber-400",
    help: "A sale reached the server after its day's deadline. Usually a missed sync — check the device is syncing nightly.",
    describe: (i) => `Sold ${new Date(String(i.details.sold_at)).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}${i.details.override_client_id ? " · under a manager override" : ""}`,
  },
  override_used: {
    label: "Manager unlocked a device", icon: KeyRound, tone: "text-blue-600 dark:text-blue-400",
    help: "Selling was unlocked with a manager PIN after a missed midnight sync.",
    describe: (i) => `${i.details.pending_sales ?? 0} sales were waiting${i.details.manager_permitted === false ? " · this person isn't allowed to override" : ""}`,
  },
  shift_conflict: {
    label: "Shift auto-closed", icon: Users, tone: "text-blue-600 dark:text-blue-400",
    help: "The same person opened a shift on a device while one was still open elsewhere; the older shift was closed.",
    describe: () => "An older open shift was closed automatically",
  },
  rejected_sale: {
    label: "Sale couldn't be recorded", icon: UserX, tone: "text-red-600 dark:text-red-400",
    help: "The full sale is saved here. Record it manually if it really happened (e.g. the cashier lost access mid-shift).",
    describe: (i) => {
      const p = i.details.payload as { total_amount?: number; receipt_number?: string } | undefined
      return `${p?.receipt_number ?? ""} ${p?.total_amount != null ? formatKES(p.total_amount) : ""} — ${String(i.details.message ?? i.details.code ?? "")}`
    },
  },
}

export default function SyncIssuesPage() {
  const qc = useQueryClient()
  const { branchId, ready } = useBranchScope()
  const [status, setStatus] = useState<"open" | "resolved">("open")
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const { data, isLoading } = useQuery<{ issues: Issue[] }>({
    queryKey: ["sync-issues", branchId, status],
    enabled: ready,
    queryFn: async () => {
      const qs = new URLSearchParams({ status, ...(branchId ? { branch_id: branchId } : {}) })
      const res = await fetch(`/api/sync-issues?${qs}`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json() as Promise<{ issues: Issue[] }>
    },
  })

  async function resolve(id: string) {
    setBusy(id)
    const res = await fetch(`/api/sync-issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note || undefined }) })
    setBusy(null)
    if (!res.ok) { toast.error("Couldn't resolve"); return }
    toast.success("Resolved")
    setNoteFor(null); setNote("")
    void qc.invalidateQueries({ queryKey: ["sync-issues"] })
  }

  const issues = data?.issues ?? []
  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sync issues</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">Things selling devices did offline that need a look. Nothing here was lost — every sale is kept.</p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--pt-muted)]">
          {(["open", "resolved"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize ${status === s ? "bg-[var(--pt-surface)] shadow-sm" : "text-[var(--pt-text-secondary)]"}`}>{s}</button>
          ))}
        </div>
      </div>

      {isLoading || !ready ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />)}</div>
      ) : issues.length === 0 ? (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] py-14 text-center">
          <CheckCircle2 size={32} className="mx-auto text-[var(--pt-green)] mb-2" />
          <p className="font-semibold">{status === "open" ? "All clear" : "Nothing resolved yet"}</p>
          <p className="text-sm text-[var(--pt-text-secondary)]">{status === "open" ? "No offline sync issues need attention." : ""}</p>
        </div>
      ) : (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] divide-y divide-[var(--pt-border)]">
          {issues.map((i) => {
            const k = KINDS[i.kind] ?? { label: i.kind, icon: AlertTriangle, tone: "", help: "", describe: () => "" }
            const Icon = k.icon
            return (
              <div key={i.id} className="px-4 sm:px-5 py-4">
                <div className="flex items-start gap-3">
                  <Icon size={18} className={`mt-0.5 shrink-0 ${k.tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{k.label}</p>
                    <p className="text-sm text-[var(--pt-text)] mt-0.5">{k.describe(i)}</p>
                    <p className="text-xs text-[var(--pt-text-tertiary)] mt-1">
                      {[i.device_name && `${i.device_name} (${i.device_code})`, i.receipt && `receipt ${i.receipt}`, i.branch_name,
                        new Date(i.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })].filter(Boolean).join(" · ")}
                    </p>
                    {status === "open" && <p className="text-xs text-[var(--pt-text-secondary)] mt-1.5">{k.help}</p>}
                    {i.resolution_note && <p className="text-xs mt-1.5">Note: {i.resolution_note}</p>}
                    {noteFor === i.id && (
                      <div className="flex gap-2 mt-2">
                        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do? (optional)" className="h-9" autoFocus />
                        <Button size="sm" onClick={() => resolve(i.id)} disabled={busy === i.id}>{busy === i.id ? <Loader2 size={14} className="animate-spin" /> : "Resolve"}</Button>
                      </div>
                    )}
                  </div>
                  {status === "open" && noteFor !== i.id && (
                    <Button size="sm" variant="outline" onClick={() => { setNoteFor(i.id); setNote("") }}>Resolve…</Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
