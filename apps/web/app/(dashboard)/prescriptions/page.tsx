"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, ClipboardList, User, Pill } from "lucide-react"
import { NewPrescriptionDialog } from "@/components/prescriptions/NewPrescriptionDialog"
import type { PrescriptionWithRelations, PrescriptionStatus } from "@pharmatrack/types"

const STATUS_STYLES: Record<PrescriptionStatus, string> = {
  active: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]",
  completed: "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] border-[var(--pt-border)]",
  cancelled: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30",
}

const TABS: { key: string; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
]

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
}

export default function PrescriptionsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState("active")
  const [open, setOpen] = useState(false)

  const { data: prescriptions = [], isLoading } = useQuery<PrescriptionWithRelations[]>({
    queryKey: ["prescriptions", tab],
    queryFn: async () => {
      const res = await fetch(`/api/prescriptions?status=${tab}`)
      if (!res.ok) throw new Error("Failed to load prescriptions")
      return (await res.json() as { prescriptions: PrescriptionWithRelations[] }).prescriptions
    },
    staleTime: 30_000,
  })

  async function setStatus(id: string, status: PrescriptionStatus) {
    try {
      const res = await fetch(`/api/prescriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed")
      toast.success(`Marked ${status}`)
      await qc.invalidateQueries({ queryKey: ["prescriptions"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prescriptions</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">Dispensing records with allergy & interaction checks</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] transition-colors shrink-0">
          <Plus size={16} /> New prescription
        </button>
      </div>

      <div className="flex gap-1 mb-5 border-b border-[var(--pt-border)]">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === key ? "border-[var(--pt-green)] text-[var(--pt-green-600)]" : "border-transparent text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
              <div className="h-3.5 bg-[var(--pt-muted-strong)] rounded w-40 mb-2" />
              <div className="h-2.5 bg-[var(--pt-muted-strong)] rounded w-64" />
            </div>
          ))}
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] flex flex-col items-center justify-center py-16 text-[var(--pt-text-tertiary)]">
          <ClipboardList size={36} strokeWidth={1.5} className="mb-3" />
          <p className="text-sm">No {tab === "all" ? "" : tab} prescriptions</p>
        </div>
      ) : (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="flex items-start gap-4 px-4 sm:px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-semibold text-sm"><User size={13} />{rx.customer?.full_name ?? "—"}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[rx.status]}`}>{rx.status}</span>
                  {rx.customer?.allergies && <span className="text-[11px] text-[var(--pt-red)]">⚠ {rx.customer.allergies}</span>}
                </div>
                <p className="mt-1 text-[13px] text-[var(--pt-text-secondary)] flex items-center gap-1 flex-wrap">
                  <Pill size={12} />
                  {rx.items.map((it) => it.drug_name).join(", ") || "—"}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--pt-text-tertiary)]">
                  {rx.prescriber_name ? `${rx.prescriber_name} · ` : ""}{fmt(rx.created_at)}
                </p>
              </div>
              {rx.status === "active" && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setStatus(rx.id, "completed")} className="px-2.5 h-7 rounded-md text-[12px] font-semibold border border-[var(--pt-green-100)] text-[var(--pt-green-600)] hover:bg-[var(--pt-green-50)]">Complete</button>
                  <button onClick={() => setStatus(rx.id, "cancelled")} className="px-2.5 h-7 rounded-md text-[12px] font-semibold border border-red-200 dark:border-red-500/30 text-[var(--pt-red)] hover:bg-red-50 dark:hover:bg-red-500/15">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {open && <NewPrescriptionDialog open={open} onOpenChange={setOpen} />}
    </div>
  )
}
