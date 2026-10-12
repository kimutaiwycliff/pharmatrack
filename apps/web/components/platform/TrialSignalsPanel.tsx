"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, History, MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"

// Operator tenant detail: other trials that share this tenant's identity
// signals, and the tenant's trial extension requests (approve / decline).

export interface PreviousTrial {
  id: string
  organization_id: string | null
  org_name: string | null
  org_exists: boolean
  status: string | null
  source: string
  granted: boolean
  trial_days: number
  created_at: string
  trial_ended_at: string | null
  matched_on: string[]
}

export interface TrialRequest {
  id: string
  status: "pending" | "approved" | "declined"
  message: string | null
  days_granted: number | null
  created_at: string
  decided_at: string | null
}

const MATCH_LABEL: Record<string, string> = {
  email: "Email", google: "Google account", registration_number: "PPB reg. no.", ip: "Network (IP)",
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })

export function PreviousTrialsPanel({ trials }: { trials: PreviousTrial[] }) {
  const hard = trials.filter((t) => t.matched_on.some((m) => m !== "ip"))
  return (
    <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden mb-5">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2">
        <History size={15} className="text-[var(--pt-text-secondary)]" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)]">Previous trials</h2>
        {hard.length > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30">Repeat trial</span>
        )}
      </div>
      {trials.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-[var(--pt-text-tertiary)]">No other trials share this pharmacy&apos;s email, Google account, registration number or network.</p>
      ) : (
        <>
          {trials.map((t) => (
            <div key={t.id} className="px-5 py-3 border-t border-[var(--pt-border)] text-sm flex flex-wrap items-center justify-between gap-2">
              <div>
                {t.org_exists && t.organization_id ? (
                  <a href={`/platform/${t.organization_id}`} className="font-semibold hover:text-[var(--pt-green-600)]">{t.org_name}</a>
                ) : (
                  <span className="font-semibold text-[var(--pt-text-secondary)]">Deleted pharmacy</span>
                )}
                <span className="text-xs text-[var(--pt-text-tertiary)] ml-2">
                  {fmt(t.created_at)} · {t.source}{t.granted ? ` · ${t.trial_days}-day trial` : " · no trial"}{t.status ? ` · ${t.status.replace("_", " ")}` : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {t.matched_on.map((m) => (
                  <span key={m} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${m === "ip" ? "bg-[var(--pt-muted)] text-[var(--pt-text-secondary)] border-[var(--pt-border)]" : "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"}`}>
                    {MATCH_LABEL[m] ?? m}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="px-5 py-3 border-t border-[var(--pt-border)] text-xs text-[var(--pt-text-tertiary)]">
            A shared network (IP) alone is only a hint — cyber cafés and shared Wi-Fi are common.
          </p>
        </>
      )}
    </section>
  )
}

export function TrialRequestsPanel({ orgId, requests, onChanged }: { orgId: string; requests: TrialRequest[]; onChanged: () => void }) {
  const [days, setDays] = useState<Record<string, number>>({})
  const [acting, setActing] = useState<string | null>(null)

  if (requests.length === 0) return null

  async function decide(id: string, decision: "approve" | "decline") {
    setActing(id)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}/trial-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(decision === "approve" ? { days: days[id] ?? STANDARD_TRIAL_DAYS } : {}) }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; trial_ends_at?: string | null; email?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success(decision === "approve" ? `Trial granted${json.trial_ends_at ? ` until ${fmt(json.trial_ends_at)}` : ""}` : "Request declined", {
        description: json.email === "sent" ? "The owner was emailed." : undefined,
      })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error")
    } finally {
      setActing(null)
    }
  }

  return (
    <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden mb-5">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2">
        <MessageSquarePlus size={15} className="text-[var(--pt-text-secondary)]" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)]">Trial extension requests</h2>
      </div>
      {requests.map((r) => (
        <div key={r.id} className="px-5 py-3 border-t border-[var(--pt-border)] text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--pt-text-tertiary)]">Requested {fmt(r.created_at)}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
              r.status === "pending" ? "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30"
                : r.status === "approved" ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]"
                : "bg-[var(--pt-muted)] text-[var(--pt-text-secondary)] border-[var(--pt-border)]"
            }`}>
              {r.status}{r.status === "approved" && r.days_granted ? ` · ${r.days_granted} days` : ""}{r.decided_at ? ` · ${fmt(r.decided_at)}` : ""}
            </span>
          </div>
          {r.message && <p className="mt-1.5 text-[var(--pt-text-secondary)] whitespace-pre-wrap">&ldquo;{r.message}&rdquo;</p>}
          {r.status === "pending" && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div className="flex items-center gap-1.5">
                <Input
                  type="number" min={1} max={90}
                  value={days[r.id] ?? STANDARD_TRIAL_DAYS}
                  onChange={(e) => setDays((d) => ({ ...d, [r.id]: Math.max(1, Math.min(90, parseInt(e.target.value) || STANDARD_TRIAL_DAYS)) }))}
                  className="h-8 w-20"
                  aria-label="Trial days"
                />
                <span className="text-xs text-[var(--pt-text-tertiary)]">days</span>
              </div>
              <Button size="sm" onClick={() => decide(r.id, "approve")} disabled={acting === r.id} className="gap-1.5">
                {acting === r.id && <Loader2 size={13} className="animate-spin" />} Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide(r.id, "decline")} disabled={acting === r.id}>Decline</Button>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
