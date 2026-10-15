"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Phone, PhoneOff, CalendarCheck } from "lucide-react"
import { toast } from "sonner"

interface CallRow {
  id: string
  scheduled_at: string
  status: string
  service_label: string | null
  customer: { full_name: string; phone: string | null }
  assigned: { id: string; name: string | null } | null
  branch_name: string | null
  contact_outcome: "called" | "no_answer" | null
  contacted_at: string | null
}
interface CallList { today: CallRow[]; tomorrow: CallRow[]; sms_enabled: boolean }

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Nairobi" }).format(new Date(iso))

// Appointment reminders without SMS: the team phones the client. Tomorrow's
// appointments are the ones to call today; today's are listed for reference.
// Every staff member who manages appointments also gets the same list by
// email at 06:00 (apps/web/app/api/cron/appointment-reminders).
export function ClientsToCallCard({ branchId }: { branchId: string | null }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const key = ["call-list", branchId ?? "all"]
  const { data, isLoading } = useQuery<CallList>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/appointments/call-list${branchId ? `?branch_id=${branchId}` : ""}`)
      if (!res.ok) throw new Error("Couldn't load appointments")
      return res.json() as Promise<CallList>
    },
    refetchInterval: 5 * 60_000,
  })

  async function act(row: CallRow, action: "called" | "no_answer" | "confirmed") {
    setBusy(row.id)
    try {
      const res = action === "confirmed"
        ? await fetch(`/api/appointments/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "confirmed" }) })
        : await fetch(`/api/appointments/${row.id}/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: action }) })
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't save that")
      toast.success(action === "confirmed" ? `${row.customer.full_name} confirmed` : action === "called" ? "Marked as called" : "Marked as no answer — try again later")
      await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ["notifications"] })])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that")
    } finally {
      setBusy(null)
    }
  }

  if (isLoading || !data) return null
  if (data.today.length === 0 && data.tomorrow.length === 0) return null
  const toCall = data.tomorrow.filter((r) => r.status === "scheduled" && !r.contact_outcome).length

  const Row = ({ r }: { r: CallRow }) => {
    const done = r.status === "confirmed" || r.contact_outcome === "called"
    return (
      <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 border-b border-[var(--pt-border)] last:border-0">
        <div className="w-20 shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">{time(r.scheduled_at)}</div>
        <div className="flex-1 min-w-[160px]">
          <p className="text-sm font-medium leading-tight">{r.customer.full_name}</p>
          <p className="text-xs text-[var(--pt-text-secondary)]">
            {[r.service_label, r.assigned?.name ? `with ${r.assigned.name}` : "unassigned", r.branch_name].filter(Boolean).join(" · ")}
          </p>
        </div>
        {r.customer.phone ? (
          <a href={`tel:${r.customer.phone}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pt-green-600)] hover:underline">
            <Phone size={14} /> {r.customer.phone}
          </a>
        ) : (
          <span className="text-xs text-[var(--pt-text-tertiary)]">No phone on file</span>
        )}
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--pt-green-600)]">
            <CheckCircle2 size={14} /> {r.status === "confirmed" ? "Confirmed" : "Called"}
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {r.contact_outcome === "no_answer" ? <span className="text-xs text-amber-600 mr-1">No answer last time</span> : null}
            <button disabled={busy === r.id} onClick={() => act(r, "called")} className="h-8 px-2.5 rounded-md border border-[var(--pt-border)] text-xs font-medium hover:bg-[var(--pt-muted)] disabled:opacity-50">
              Called
            </button>
            <button disabled={busy === r.id} onClick={() => act(r, "no_answer")} className="h-8 px-2.5 rounded-md border border-[var(--pt-border)] text-xs font-medium hover:bg-[var(--pt-muted)] disabled:opacity-50 inline-flex items-center gap-1">
              <PhoneOff size={12} /> No answer
            </button>
            <button disabled={busy === r.id} onClick={() => act(r, "confirmed")} className="h-8 px-2.5 rounded-md bg-[var(--pt-green)] text-white text-xs font-semibold hover:bg-[var(--pt-green-600)] disabled:opacity-50">
              Confirmed
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-sm font-bold flex items-center gap-2">
          <CalendarCheck size={16} className="text-[var(--pt-green-600)]" />
          Clients to call
          {toCall > 0 ? <span className="text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200 px-2 py-0.5">{toCall}</span> : null}
        </p>
        <Link href="/appointments" className="text-xs font-medium text-[var(--pt-green-600)] hover:underline">All appointments</Link>
      </div>
      {!data.sms_enabled ? (
        <p className="text-xs text-[var(--pt-text-secondary)] mb-2">SMS reminders are off — phone these clients to remind them. The same list is emailed to your team each morning.</p>
      ) : null}
      {data.tomorrow.length > 0 ? (
        <>
          <p className="text-[11px] uppercase tracking-wide font-semibold text-[var(--pt-text-secondary)] mt-3">Tomorrow — call today</p>
          <ul>{data.tomorrow.map((r) => <Row key={r.id} r={r} />)}</ul>
        </>
      ) : null}
      {data.today.length > 0 ? (
        <>
          <p className="text-[11px] uppercase tracking-wide font-semibold text-[var(--pt-text-secondary)] mt-4">Today</p>
          <ul>{data.today.map((r) => <Row key={r.id} r={r} />)}</ul>
        </>
      ) : null}
    </div>
  )
}
