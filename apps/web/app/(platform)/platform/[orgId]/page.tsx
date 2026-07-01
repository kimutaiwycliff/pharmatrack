"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Plan { id: string; code: string; name: string; price_kes: number; interval: string }
interface Sub {
  id: string; status: string; plan_id: string | null
  trial_ends_at: string | null; current_period_end: string | null
}
interface Payment { id: string; amount_kes: number; method: string | null; reference: string | null; period_end: string | null; created_at: string }
interface TenantDetail {
  tenant: { id: string; name: string; email: string | null; phone: string | null; created_at: string; subscriptions: Sub[] }
  branch_count: number; staff_count: number; plans: Plan[]; payments: Payment[]
  deletion: { scheduled_purge_at: string; requested_at: string } | null
}

const selectCls = "w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "")
const daysUntil = (iso: string) => {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  return d <= 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`
}

export default function TenantDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [confirmName, setConfirmName] = useState("")
  const [scheduling, setScheduling] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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
  const [synced, setSynced] = useState(false)
  if (sub && !synced) {
    setSynced(true)
    setStatus(sub.status)
    setPlanId(sub.plan_id ?? "")
    setPeriodEnd(dateOnly(sub.current_period_end))
    setTrialEnds(dateOnly(sub.trial_ends_at))
  }

  // Payment form
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("mpesa")
  const [reference, setReference] = useState("")
  const [payPeriodEnd, setPayPeriodEnd] = useState("")
  const [paying, setPaying] = useState(false)

  async function saveSubscription() {
    setSaving(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          plan_id: planId || null,
          current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
          trial_ends_at: trialEnds ? new Date(trialEnds).toISOString() : null,
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

  async function logPayment() {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return }
    setPaying(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_kes: amt, method, reference: reference || undefined, period_end: payPeriodEnd || undefined, activate: true }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Payment recorded")
      setAmount(""); setReference(""); setPayPeriodEnd("")
      await qc.invalidateQueries({ queryKey: ["tenant", orgId] })
      await qc.invalidateQueries({ queryKey: ["tenants"] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
    finally { setPaying(false) }
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
          {t.email ?? "—"} · {data.branch_count} branches · {data.staff_count} staff · since {new Date(t.created_at).toLocaleDateString("en-KE", { month: "short", year: "numeric" })}
        </p>
      </div>

      {/* Subscription */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] mb-4">Subscription</h2>
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

      {/* Record payment */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] mb-4">Record payment</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div><Label className="text-sm font-medium">Amount (KES)</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 h-10" /></div>
          <div><Label className="text-sm font-medium">Method</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={`mt-1.5 ${selectCls}`}>
              {["mpesa", "bank", "cash", "card", "other"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><Label className="text-sm font-medium">Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1.5 h-10" /></div>
          <div><Label className="text-sm font-medium">Covers until</Label><Input type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} className="mt-1.5 h-10" /></div>
        </div>
        <p className="text-xs text-[var(--pt-text-tertiary)] mt-2">Recording a payment with a &quot;covers until&quot; date activates the subscription and extends paid-until.</p>
        <Button onClick={logPayment} disabled={paying} size="sm" className="mt-3 gap-1.5">{paying && <Loader2 size={13} className="animate-spin" />} Record payment</Button>
      </section>

      {/* Payment history */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] px-5 pt-5 pb-3">Payment history</h2>
        {data.payments.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--pt-text-tertiary)]">No payments recorded</p>
        ) : (
          <div>
            {data.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 border-t border-[var(--pt-border)] text-sm">
                <div>
                  <span className="font-semibold tabular-nums">KES {Number(p.amount_kes).toLocaleString()}</span>
                  <span className="text-[var(--pt-text-tertiary)] ml-2 text-xs">{p.method ?? "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
                </div>
                <span className="text-xs text-[var(--pt-text-tertiary)]">{new Date(p.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            ))}
          </div>
        )}
      </section>

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
              You can cancel any time before then to restore access.
            </p>
            <Button variant="outline" onClick={cancelDeletion} disabled={cancelling} className="gap-1.5">
              {cancelling && <Loader2 size={14} className="animate-spin" />} Cancel deletion &amp; restore access
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--pt-text-secondary)] mb-3">
              Schedule <strong>{t.name}</strong> for deletion. It&rsquo;s blocked immediately and permanently purged after a
              <strong> 30-day grace period</strong> — branches, staff, products, inventory, sales, customers, subscription and
              payment history. Staff logins are then freed so the email can sign up again. You can cancel any time within the 30 days.
            </p>
            {!showDelete ? (
              <Button variant="outline" onClick={() => setShowDelete(true)} className="gap-1.5 text-[var(--pt-red)] border-[var(--pt-red)]">
                <Trash2 size={15} /> Schedule deletion…
              </Button>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm">Type <span className="font-mono font-semibold">{t.name}</span> to confirm</Label>
                <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={t.name} className="h-10 max-w-sm" autoFocus />
                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={scheduleDeletion} disabled={scheduling || !nameMatches} className="gap-1.5 bg-[var(--pt-red)] hover:opacity-90 text-white border-transparent">
                    {scheduling && <Loader2 size={14} className="animate-spin" />} Schedule deletion
                  </Button>
                  <Button variant="outline" onClick={() => { setShowDelete(false); setConfirmName("") }} disabled={scheduling}>Cancel</Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
