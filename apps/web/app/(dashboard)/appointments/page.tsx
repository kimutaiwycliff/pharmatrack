"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarClock, Plus, CalendarX2 } from "lucide-react"
import { AppointmentCard } from "@/components/appointments/AppointmentCard"
import { BookAppointmentDialog, type BookPrefill } from "@/components/appointments/BookAppointmentDialog"
import type { AppointmentWithRelations } from "@pharmatrack/types"

type Tab = "today" | "upcoming" | "past"

const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
]

function dayBounds(tab: Tab) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999)
  const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1)
  if (tab === "today") return { from: start.toISOString(), to: endToday.toISOString() }
  if (tab === "upcoming") return { from: tomorrow.toISOString(), to: undefined }
  return { from: undefined, to: start.toISOString() } // past
}

function dayKey(iso: string) {
  return new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" }).format(new Date(iso))
}

export default function AppointmentsPage() {
  const [tab, setTab] = useState<Tab>("today")
  const [bookOpen, setBookOpen] = useState(false)
  const [prefill, setPrefill] = useState<BookPrefill | undefined>(undefined)

  const bounds = dayBounds(tab)
  const { data: appointments = [], isLoading } = useQuery<AppointmentWithRelations[]>({
    queryKey: ["appointments", tab],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (bounds.from) params.set("from", bounds.from)
      if (bounds.to) params.set("to", bounds.to)
      const res = await fetch(`/api/appointments?${params}`)
      if (!res.ok) throw new Error("Failed to load appointments")
      const json = (await res.json()) as { appointments: AppointmentWithRelations[] }
      return json.appointments
    },
    staleTime: 30_000,
  })

  // Past tab: show most-recent first.
  const ordered = useMemo(() => {
    const arr = [...appointments]
    if (tab === "past") arr.reverse()
    return arr
  }, [appointments, tab])

  const groups = useMemo(() => {
    const map = new Map<string, AppointmentWithRelations[]>()
    for (const a of ordered) {
      const k = dayKey(a.scheduled_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(a)
    }
    return Array.from(map.entries())
  }, [ordered])

  function openBook(p?: BookPrefill) { setPrefill(p); setBookOpen(true) }

  function handleNextDose(appt: AppointmentWithRelations, nextDueIso: string) {
    openBook({
      customer_id: appt.customer?.id,
      customer_name: appt.customer?.full_name,
      customer_phone: appt.customer?.phone ?? undefined,
      customer_email: appt.customer?.email ?? undefined,
      service: appt.service,
      scheduled_at: nextDueIso,
      parent_appointment_id: appt.id,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">Book and monitor injections, family planning and clinical visits</p>
        </div>
        <button
          onClick={() => openBook(undefined)}
          className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] transition-colors shrink-0"
        >
          <Plus size={16} /> Book appointment
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-[var(--pt-border)] overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px shrink-0 whitespace-nowrap transition-colors ${
              tab === key
                ? "border-[var(--pt-green)] text-[var(--pt-green-600)]"
                : "border-transparent text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
              <div className="h-3.5 bg-[var(--pt-muted-strong)] rounded w-48 mb-2" />
              <div className="h-2.5 bg-[var(--pt-muted-strong)] rounded w-64" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] flex flex-col items-center justify-center py-16 text-[var(--pt-text-tertiary)]">
          <CalendarX2 size={36} strokeWidth={1.5} className="mb-3" />
          <p className="text-sm">No {tab} appointments</p>
          {tab !== "past" && (
            <button onClick={() => openBook(undefined)} className="mt-3 text-[13px] text-[var(--pt-green-600)] hover:underline inline-flex items-center gap-1">
              <CalendarClock size={14} /> Book one
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <div key={day}>
              <p className="text-xs font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-2">{day}</p>
              <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
                {items.map((a) => (
                  <AppointmentCard key={a.id} appt={a} onCompletedNextDose={handleNextDose} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {bookOpen && (
        <BookAppointmentDialog open={bookOpen} onOpenChange={setBookOpen} prefill={prefill} />
      )}
    </div>
  )
}
