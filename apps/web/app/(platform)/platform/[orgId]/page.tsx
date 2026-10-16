"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PaymentPeriodDialog } from "@/components/platform/PaymentPeriodDialog"
import { PreviousTrialsPanel, TrialRequestsPanel, type PreviousTrial, type TrialRequest } from "@/components/platform/TrialSignalsPanel"
import { daysLeft, endOfNairobiDay, nairobiDay } from "@/lib/billing/period"

interface Plan { id: string; code: string; name: string; price_kes: number; interval: string }
interface Sub {
  id: string; status: string; effective_status: string; plan_id: string | null
  trial_ends_at: string | null; current_period_end: string | null; updated_at: string
  plan: { name: string; price_kes: number; interval: string } | null
}
interface Payment {
  id: string; amount_kes: number; method: string | null; reference: string | null
  period_start: string | null; period_end: string | null; created_at: string; confirmed_at: string | null; status: string
}
interface TenantDetail {
  tenant: {
    id: string; name: string; email: string | null; phone: string | null; created_at: string; subscriptions: Sub[]
    owner_email: string | null; owner_name: string | null; registration_number: string | null
  }
  branch_count: number; staff_count: number; plans: Plan[]; payments: Payment[]
  deletion: { scheduled_purge_at: string; requested_at: string } | null
  previous_trials: PreviousTrial[]
  trial_requests: TrialRequest[]
  messaging: { sms_enabled: boolean; whatsapp_enabled: boolean; provider_ready: { sms: boolean; whatsapp: boolean } }
}

const selectCls = "w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
// Nairobi calendar day — iso.slice(0,10) showed the UTC day, one day early for
// period ends stored as end-of-day EAT.
const dateOnly = (iso: string | null) => (iso ? nairobiDay(new Date(iso)) : "")
const shortDay = (ymd: string) => endOfNairobiDay(ymd).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })
const daysUntil = (iso: string) => {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  return d <= 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`
}

export default function TenantDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [confirmName, setConfirmName] = useState("")
  const [scheduling, setScheduling] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [purging, setPurging] = useState(false)

  const { data, isLoading } = useQuery<TenantDetail>({
    queryKey: ["tenant", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/platform/tenants/${orgId}`)
      if (!res.ok) throw new Error("Failed to load tenant")
      return res.json() as Promise<TenantDetail>
    },
  })

  const sub = data?.tenant.subscriptions?.[0]
  const [status, setStatus] = useState<string>("")
  const [planId, setPlanId] = useState<string>("")
  const [periodEnd, setPeriodEnd] = useState<string>("")
  const [trialEnds, setTrialEnds] = useState<string>("")
  // Re-sync whenever the server row changes (keyed on updated_at). Syncing
  // only once left Status / Paid-until stale after a payment was confirmed, so
  // a later Save silently wrote the OLD period end back.
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  if (sub && sub.updated_at !== syncedAt) {
    setSyncedAt(sub.updated_at)
    setStatus(sub.status)
    setPlanId(sub.plan_id ?? "")
    setPeriodEnd(dateOnly(sub.current_period_end))
    setTrialEnds(dateOnly(sub.trial_ends_at))
  }

  // Confirm-claim / record-payment dialog
  const [dialog, setDialog] = useState<null | { mode: "record" } | { mode: "confirm"; claim: Payment }>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)
  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["tenant", orgId] })
    await qc.invalidateQueries({ queryKey: ["tenants"] })
  }

  // Paid add-ons: SMS / WhatsApp reminders (lib/notifications/messaging).
  const [addonBusy, setAddonBusy] = useState<string | null>(null)
  async function setAddon(key: "sms_enabled" | "whatsapp_enabled", on: boolean) {
    setAddonBusy(key)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}/messaging`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: on }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't save")
      toast.success(`${key === "sms_enabled" ? "SMS" : "WhatsApp"} reminders ${on ? "switched on" : "switched off"}`)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save")
    } finally {
      setAddonBusy(null)
    }
  }

  async function saveSubscription() {
    setSaving(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          plan_id: planId || null,
          current_period_end: periodEnd ? endOfNairobiDay(periodEnd).toISOString() : null,
          trial_ends_at: trialEnds ? endOfNairobiDay(trialEnds).toISOString() : null,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Subscription updated")
      await qc.invalidateQueries({ queryKey: ["tenant", orgId] })
      await qc.invalidateQueries({ queryKey: ["tenants"] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
    finally { setSaving(false) }
  }

  async function rejectClaim(paymentId: string) {
    setActingOn(paymentId)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      })
      const json = (await res.json()) as { error?: string; owner_notified?: boolean }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Payment rejected", { description: json.owner_notified ? "The owner was emailed to resubmit." : undefined })
      await qc.invalidateQueries({ queryKey: ["tenant", orgId] })
      await qc.invalidateQueries({ queryKey: ["tenants"] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
    finally { setActingOn(null) }
  }

  async function scheduleDeletion() {
    setScheduling(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}/deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      })
      const json = (await res.json()) as { error?: string; scheduled_purge_at?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Tenant scheduled for deletion")
      setShowDelete(false); setConfirmName("")
      await qc.invalidateQueries({ queryKey: ["tenant", orgId] })
      await qc.invalidateQueries({ queryKey: ["tenants"] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
    finally { setScheduling(false) }
  }

  async function cancelDeletion() {
    setCancelling(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}/deletion`, { method: "DELETE" })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Deletion cancelled — access restored")
      await qc.invalidateQueries({ queryKey: ["tenant", orgId] })
      await qc.invalidateQueries({ queryKey: ["tenants"] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
    finally { setCancelling(false) }
  }

  async function deleteNow() {
    setPurging(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      })
      const json = (await res.json()) as { error?: string; freed_accounts?: number }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success(`Tenant permanently deleted${json.freed_accounts ? ` · ${json.freed_accounts} login(s) freed` : ""}`)
      await qc.invalidateQueries({ queryKey: ["tenants"] })
      router.push("/platform")
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); setPurging(false) }
  }

  if (isLoading || !data) {
    return <div className="flex items-center gap-2 text-[var(--pt-text-secondary)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
  }

  const t = data.tenant
  const nameMatches = confirmName.trim().toLowerCase() === t.name.trim().toLowerCase()
  return (
    <div className="max-w-3xl">
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] mb-4"><ArrowLeft size={15} /> All tenants</Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.name}</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
          Owner {t.owner_email ?? "—"}{t.email && t.email !== t.owner_email ? ` · ${t.email}` : ""}{t.registration_number ? ` · PPB ${t.registration_number}` : ""} · {data.branch_count} branches · {data.staff_count} staff · since {new Date(t.created_at).toLocaleDateString("en-KE", { month: "short", year: "numeric" })}
        </p>
      </div>

      <TrialRequestsPanel orgId={orgId} requests={data.trial_requests} onChanged={() => void refresh()} />

      {/* Subscription */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)]">Subscription</h2>
          {sub && <SubscriptionSummary sub={sub} />}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Status</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1.5 ${selectCls}`}>
              {["trialing", "active", "past_due", "suspended", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-sm font-medium">Plan</Label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={`mt-1.5 ${selectCls}`}>
              <option value="">—</option>
              {data.plans.map((p) => <option key={p.id} value={p.id}>{p.name} (KES {p.price_kes}/{p.interval})</option>)}
            </select>
          </div>
          <div>
            <Label className="text-sm font-medium">Paid until</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1.5 h-10" />
          </div>
          <div>
            <Label className="text-sm font-medium">Trial ends</Label>
            <Input type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} className="mt-1.5 h-10" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button onClick={saveSubscription} disabled={saving} className="gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Save</Button>
          {status !== "suspended"
            ? <Button variant="outline" onClick={() => setStatus("suspended")} className="text-[var(--pt-red)] border-[var(--pt-red)]">Suspend…</Button>
            : <Button variant="outline" onClick={() => setStatus("active")}>Reactivate…</Button>}
          {status !== "cancelled"
            ? <Button variant="outline" onClick={() => setStatus("cancelled")} className="text-[var(--pt-red)] border-[var(--pt-red)]">Ban…</Button>
            : <Button variant="outline" onClick={() => setStatus("active")}>Restore…</Button>}
          <span className="text-xs text-[var(--pt-text-tertiary)]">choose a state, then Save</span>
        </div>
      </section>

      {/* Paid add-ons */}
      {data ? (
        <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)]">Paid add-ons</h2>
            <p className="text-xs text-[var(--pt-text-tertiary)] mt-1">
              Switch on only after the pharmacy has paid. Until then their app never mentions SMS or WhatsApp, and no messages are sent.
            </p>
          </div>
          {([
            { key: "sms_enabled", label: "SMS appointment reminders", on: data.messaging.sms_enabled, ready: data.messaging.provider_ready.sms },
            { key: "whatsapp_enabled", label: "WhatsApp appointment reminders", on: data.messaging.whatsapp_enabled, ready: data.messaging.provider_ready.whatsapp },
          ] as const).map((a) => (
            <label key={a.key} className="flex items-start justify-between gap-3 cursor-pointer">
              <span className="text-sm">
                {a.label}
                {!a.ready ? <span className="block text-xs text-amber-600 dark:text-amber-400">Africa’s Talking isn’t configured on the server yet — nothing will send until it is.</span> : null}
              </span>
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--pt-green)]" checked={a.on} disabled={addonBusy === a.key}
                onChange={(e) => void setAddon(a.key, e.target.checked)} />
            </label>
          ))}
        </section>
      ) : null}

      {/* Record payment */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)]">Record payment</h2>
          <p className="text-xs text-[var(--pt-text-tertiary)] mt-1">Paid outside the app? Record it — the period is worked out for you and the owner is emailed.</p>
        </div>
        <Button size="sm" onClick={() => setDialog({ mode: "record" })}>Record payment…</Button>
      </section>

      {/* Payment history */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] px-5 pt-5 pb-3">Payment history</h2>
        {data.payments.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--pt-text-tertiary)]">No payments recorded</p>
        ) : (
          <div>
            {data.payments.map((p) => (
              <div key={p.id} className="px-5 py-3 border-t border-[var(--pt-border)] text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold tabular-nums">KES {Number(p.amount_kes).toLocaleString()}</span>
                    <span className="text-[var(--pt-text-tertiary)] ml-2 text-xs">{p.method ?? "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
                    {p.status !== "confirmed" && (
                      <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        p.status === "pending"
                          ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                          : "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30"
                      }`}>{p.status}</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--pt-text-tertiary)]">{new Date(p.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                {p.status === "confirmed" && p.period_end && (
                  <p className="text-xs text-[var(--pt-text-secondary)] mt-1">
                    Covers {p.period_start ? `${shortDay(p.period_start)} → ` : "to "}{shortDay(p.period_end)}
                  </p>
                )}
                {p.status === "pending" && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Button size="sm" onClick={() => setDialog({ mode: "confirm", claim: p })} disabled={actingOn === p.id}>
                      Review &amp; confirm…
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rejectClaim(p.id)} disabled={actingOn === p.id} className="gap-1.5 text-[var(--pt-red)] border-[var(--pt-red)]">
                      {actingOn === p.id && <Loader2 size={13} className="animate-spin" />} Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-5">
        <PreviousTrialsPanel trials={data.previous_trials} />
      </div>

      {/* Danger zone */}
      <section className="mt-6 rounded-xl border border-[var(--pt-red)]/40 bg-[var(--pt-red-50)] p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-red)] mb-2">Danger zone</h2>

        {data.deletion ? (
          <div>
            <p className="text-sm text-[var(--pt-text)] font-medium">
              ⚠️ Scheduled for permanent deletion on{" "}
              <strong>{new Date(data.deletion.scheduled_purge_at).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</strong>
              {" "}({daysUntil(data.deletion.scheduled_purge_at)}).
            </p>
            <p className="text-sm text-[var(--pt-text-secondary)] mt-1 mb-3">
              The tenant is blocked from signing in. On that date all its data is permanently purged and staff emails are freed.
              Cancel any time before then to restore access — or purge immediately below.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={cancelDeletion} disabled={cancelling} className="gap-1.5">
                {cancelling && <Loader2 size={14} className="animate-spin" />} Cancel deletion &amp; restore access
              </Button>
              {!showDelete && (
                <Button variant="outline" onClick={() => setShowDelete(true)} className="gap-1.5 text-[var(--pt-red)] border-[var(--pt-red)]">
                  <Trash2 size={15} /> Purge now instead…
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--pt-text-secondary)] mb-3">
              Delete <strong>{t.name}</strong> — branches, staff, products, inventory, sales, customers, subscription and payment
              history. Staff logins are freed so the email can sign up again. Choose a <strong>30-day grace period</strong>
              (reversible) or <strong>delete permanently now</strong>.
            </p>
            {!showDelete && (
              <Button variant="outline" onClick={() => setShowDelete(true)} className="gap-1.5 text-[var(--pt-red)] border-[var(--pt-red)]">
                <Trash2 size={15} /> Delete tenant…
              </Button>
            )}
          </>
        )}

        {showDelete && (
          <div className="space-y-2 mt-3">
            <Label className="text-sm">Type <span className="font-mono font-semibold">{t.name}</span> to confirm</Label>
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={t.name} className="h-10 max-w-sm" autoFocus />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!data.deletion && (
                <Button onClick={scheduleDeletion} disabled={scheduling || purging || !nameMatches} variant="outline" className="gap-1.5">
                  {scheduling && <Loader2 size={14} className="animate-spin" />} Schedule 30-day deletion
                </Button>
              )}
              <Button onClick={deleteNow} disabled={purging || scheduling || !nameMatches} className="gap-1.5 bg-[var(--pt-red)] hover:opacity-90 text-white border-transparent">
                {purging && <Loader2 size={14} className="animate-spin" />} Delete permanently now
              </Button>
              <Button variant="outline" onClick={() => { setShowDelete(false); setConfirmName("") }} disabled={scheduling || purging}>Cancel</Button>
            </div>
            {!data.deletion && (
              <p className="text-xs text-[var(--pt-text-tertiary)]">Schedule = reversible for 30 days · Delete now = immediate &amp; irreversible.</p>
            )}
          </div>
        )}
      </section>
      {dialog && (
        dialog.mode === "confirm"
          ? <PaymentPeriodDialog mode="confirm" claim={dialog.claim} orgId={orgId} sub={sub} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void refresh() }} />
          : <PaymentPeriodDialog mode="record" orgId={orgId} sub={sub} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void refresh() }} />
      )}
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]",
  trialing: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  past_due: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  suspended: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300",
}

/** What the tenant is actually experiencing right now (effective status). */
function SubscriptionSummary({ sub }: { sub: Sub }) {
  const s = sub.effective_status ?? sub.status
  const until = s === "trialing" ? sub.trial_ends_at : sub.current_period_end
  const left = until ? daysLeft(until) : null
  return (
    <div className="text-right">
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLE[s] ?? ""}`}>{s.replace("_", " ")}</span>
      {until && (
        <p className="text-xs text-[var(--pt-text-secondary)] mt-1">
          {left! >= 0 ? (s === "trialing" ? "Trial ends " : "Next renewal ") : "Lapsed "}
          <span className="font-semibold">{shortDay(nairobiDay(new Date(until)))}</span>
          {left! >= 0 ? ` (${left} day${left === 1 ? "" : "s"})` : ""}
        </p>
      )}
    </div>
  )
}
