"use client"

import { useState } from "react"
import { Clock, User, Phone, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { serviceLabel } from "@/lib/appointments/services"
import type { AppointmentWithRelations, AppointmentStatus } from "@pharmatrack/types"

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
  confirmed: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]",
  completed: "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] border-[var(--pt-border)]",
  cancelled: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30",
  no_show: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No-show",
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Nairobi" }).format(new Date(iso))
}

interface Props {
  appt: AppointmentWithRelations
  onCompletedNextDose?: (appt: AppointmentWithRelations, nextDueIso: string) => void
}

export function AppointmentCard({ appt, onCompletedNextDose }: Props) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function setStatus(status: AppointmentStatus) {
    setBusy(true)
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const json = (await res.json()) as { error?: string; nextDue?: string | null }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`)
      await qc.invalidateQueries({ queryKey: ["appointments"] })
      if (status === "completed" && json.nextDue) onCompletedNextDose?.(appt, json.nextDue)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  const terminal = ["completed", "cancelled", "no_show"].includes(appt.status)

  return (
    <div className="flex items-start gap-4 px-4 sm:px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0">
      {/* Time */}
      <div className="w-16 shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums">{fmtTime(appt.scheduled_at)}</p>
        <p className="text-[11px] text-[var(--pt-text-tertiary)]">{appt.duration_minutes}m</p>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate">{appt.service_label ?? serviceLabel(appt.service)}</p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[appt.status]}`}>
            {STATUS_LABEL[appt.status]}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px] text-[var(--pt-text-secondary)]">
          <span className="inline-flex items-center gap-1"><User size={12} />{appt.customer?.full_name ?? "—"}</span>
          {appt.customer?.phone && <span className="inline-flex items-center gap-1"><Phone size={12} />{appt.customer.phone}</span>}
          {appt.assignee && <span className="inline-flex items-center gap-1 text-[var(--pt-text-tertiary)]">→ {appt.assignee.full_name}</span>}
        </div>
        {appt.notes && <p className="mt-1 text-[12px] text-[var(--pt-text-tertiary)] truncate">{appt.notes}</p>}
        {appt.next_due_date && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--pt-green-600)]"><Clock size={11} /> Next dose due {new Date(appt.next_due_date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</p>
        )}

        {/* Actions */}
        {!terminal && (
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {busy && <Loader2 size={13} className="animate-spin text-[var(--pt-text-tertiary)]" />}
            {appt.status === "scheduled" && (
              <ActionBtn onClick={() => setStatus("confirmed")} disabled={busy}>Confirm</ActionBtn>
            )}
            <ActionBtn onClick={() => setStatus("completed")} disabled={busy} variant="green">Complete</ActionBtn>
            <ActionBtn onClick={() => setStatus("no_show")} disabled={busy}>No-show</ActionBtn>
            <ActionBtn onClick={() => setStatus("cancelled")} disabled={busy} variant="red">Cancel</ActionBtn>
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ children, onClick, disabled, variant }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; variant?: "green" | "red" }) {
  const tone =
    variant === "green"
      ? "border-[var(--pt-green-100)] text-[var(--pt-green-600)] hover:bg-[var(--pt-green-50)]"
      : variant === "red"
        ? "border-red-200 dark:border-red-500/30 text-[var(--pt-red)] hover:bg-red-50 dark:hover:bg-red-500/15"
        : "border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"
  return (
    <button onClick={onClick} disabled={disabled} className={`px-2.5 h-7 rounded-md text-[12px] font-semibold border transition-colors disabled:opacity-50 ${tone}`}>
      {children}
    </button>
  )
}
