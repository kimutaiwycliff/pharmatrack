"use client"

import { useState } from "react"
import { Plus, Pencil, Check, X, Loader2, Trash2, CalendarClock } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AppointmentService } from "@pharmatrack/types"

export const SERVICES_MANAGE_KEY = ["appointment-services", "manage"] as const

interface Props {
  services: AppointmentService[]
  canManage: boolean
}

function recurrenceText(weeks: number | null) {
  return weeks ? `repeats every ${weeks} week${weeks === 1 ? "" : "s"}` : "one-off"
}

function ServiceRow({ service, canManage }: { service: AppointmentService; canManage: boolean }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(service.label)
  const [weeks, setWeeks] = useState(service.recurrence_weeks ? String(service.recurrence_weeks) : "")
  const [loading, setLoading] = useState(false)

  async function call(method: string, body?: Record<string, unknown>, success?: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/appointment-services/${service.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      if (success) toast.success(success)
      setEditing(false)
      await qc.invalidateQueries({ queryKey: ["appointment-services"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  function save() {
    if (!label.trim()) { toast.error("Service name is required"); return }
    const n = weeks.trim() ? parseInt(weeks) : null
    if (weeks.trim() && (isNaN(n!) || n! < 1)) { toast.error("Weeks must be a positive number"); return }
    void call("PATCH", { label: label.trim(), recurrence_weeks: n }, "Service updated")
  }

  if (editing) {
    return (
      <div className="px-5 py-4 space-y-3 border-b border-[var(--pt-border)] last:border-b-0">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <Input placeholder="Service name *" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" autoFocus />
          <Input type="number" min={1} placeholder="Repeat weeks (blank = one-off)" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="h-9 sm:w-56" />
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--pt-green)] text-white text-xs font-semibold hover:bg-[var(--pt-green-600)] transition-colors">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
          </button>
          <button onClick={() => { setEditing(false); setLabel(service.label); setWeeks(service.recurrence_weeks ? String(service.recurrence_weeks) : "") }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--pt-border)] text-xs font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors">
            <X size={12} /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-between px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 ${!service.is_active ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{service.label}</p>
        <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-0.5">{recurrenceText(service.recurrence_weeks)}</p>
      </div>
      {canManage && (
        <div className="flex items-center gap-2 shrink-0">
          {service.is_active && (
            <button onClick={() => setEditing(true)} className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-[var(--pt-muted-strong)] transition-colors" title="Edit"><Pencil size={13} /></button>
          )}
          <button
            onClick={() => call("PATCH", { is_active: !service.is_active }, service.is_active ? "Deactivated" : "Reactivated")}
            disabled={loading}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${service.is_active ? "border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]" : "border-[var(--pt-green-100)] text-[var(--pt-green-600)] bg-[var(--pt-green-50)]"}`}
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : service.is_active ? "Deactivate" : "Reactivate"}
          </button>
          <button onClick={() => call("DELETE", undefined, "Removed")} disabled={loading} className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-red)] hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors" title="Delete"><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  )
}

function AddServiceRow({ onAdded }: { onAdded: () => void }) {
  const [label, setLabel] = useState("")
  const [weeks, setWeeks] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!label.trim()) { toast.error("Service name is required"); return }
    const n = weeks.trim() ? parseInt(weeks) : null
    if (weeks.trim() && (isNaN(n!) || n! < 1)) { toast.error("Weeks must be a positive number"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/appointment-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), recurrence_weeks: n }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Service added")
      setLabel(""); setWeeks("")
      onAdded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-4 border-t border-[var(--pt-border)] space-y-3">
      <p className="text-xs font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">New Service</p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <Input placeholder="Service name * (e.g. Family Planning — Implant)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" autoFocus />
        <Input type="number" min={1} placeholder="Repeat weeks (blank = one-off)" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="h-9 sm:w-56" />
      </div>
      <Button onClick={submit} disabled={loading} size="sm" className="gap-1.5">
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add Service
      </Button>
    </div>
  )
}

export function AppointmentServiceList({ services, canManage }: Props) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const activeCount = services.filter((s) => s.is_active).length

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--pt-text-secondary)]">
          {activeCount} active service{activeCount !== 1 ? "s" : ""} · used when booking appointments
        </p>
        {canManage && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1.5"><Plus size={13} /> Add Service</Button>
        )}
      </div>

      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        {services.length === 0 && !adding && (
          <div className="px-5 py-10 flex flex-col items-center text-center text-sm text-[var(--pt-text-tertiary)]">
            <CalendarClock size={32} strokeWidth={1.5} className="mb-3" /> No services yet
          </div>
        )}
        {services.map((s) => <ServiceRow key={s.id} service={s} canManage={canManage} />)}
        {adding && <AddServiceRow onAdded={async () => { setAdding(false); await qc.invalidateQueries({ queryKey: ["appointment-services"] }) }} />}
      </div>
    </div>
  )
}
