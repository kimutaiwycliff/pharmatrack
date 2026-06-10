"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
interface StaffMember { id: string; full_name: string; role: string }
interface CustomerHit { id: string; full_name: string; phone: string | null; email: string | null; reminders_opt_in?: boolean }
interface ServiceOption { id: string; slug: string; label: string; recurrence_weeks: number | null }

export interface BookPrefill {
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  service?: string
  scheduled_at?: string // ISO
  parent_appointment_id?: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  prefill?: BookPrefill
  onBooked?: () => void
}

const selectCls =
  "w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"

// datetime-local string (local time) for an ISO/Date, or a sensible default (next hour).
function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000)
  if (!iso) { d.setMinutes(0, 0, 0) }
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BookAppointmentDialog({ open, onOpenChange, prefill, onBooked }: Props) {
  const qc = useQueryClient()
  const branches = useSessionStore((s) => s.branches)
  const profile = useSessionStore((s) => s.profile)
  const activeBranchId = useUIStore((s) => s.activeBranchId)

  const [customerId, setCustomerId] = useState<string | undefined>(prefill?.customer_id)
  const [name, setName] = useState(prefill?.customer_name ?? "")
  const [phone, setPhone] = useState(prefill?.customer_phone ?? "")
  const [email, setEmail] = useState(prefill?.customer_email ?? "")
  const [service, setService] = useState(prefill?.service ?? "")
  const [branchId, setBranchId] = useState(activeBranchId ?? branches[0]?.id ?? "")
  const [when, setWhen] = useState(toLocalInput(prefill?.scheduled_at))
  const [duration, setDuration] = useState(15)
  const [assignee, setAssignee] = useState<string>(profile?.id ?? "")
  const [notes, setNotes] = useState("")
  const [optIn, setOptIn] = useState(true)
  const [pending, startTransition] = useTransition()

  // Staff list for the assignee select (owner/manager get the full list; others fall back to self).
  const { data: staff = [] } = useQuery<StaffMember[]>({
    queryKey: ["staff"],
    queryFn: async () => {
      const res = await fetch("/api/staff")
      if (!res.ok) return []
      const json = (await res.json()) as { staff: StaffMember[] }
      return json.staff
    },
    staleTime: 5 * 60_000,
    enabled: open,
  })
  const assignable = staff.length
    ? staff.filter((s) => ["owner", "manager", "pharmacist"].includes(s.role))
    : profile ? [{ id: profile.id, full_name: profile.full_name, role: profile.role }] : []

  // Services the pharmacy offers (managed in Settings → Services).
  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["appointment-services"],
    queryFn: async () => {
      const res = await fetch("/api/appointment-services")
      if (!res.ok) return []
      const json = (await res.json()) as { services: ServiceOption[] }
      return json.services
    },
    staleTime: 5 * 60_000,
    enabled: open,
  })
  const selectedSlug = service || services[0]?.slug || ""

  // Customer autocomplete.
  const search = useDebounce(name || phone, 250)
  const { data: hits = [] } = useQuery<CustomerHit[]>({
    queryKey: ["customer-search", search],
    queryFn: async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(search)}`)
      if (!res.ok) return []
      const json = (await res.json()) as { customers: CustomerHit[] }
      return json.customers
    },
    enabled: open && !customerId && search.length >= 2,
    staleTime: 30_000,
  })

  function pickCustomer(c: CustomerHit) {
    setCustomerId(c.id)
    setName(c.full_name)
    setPhone(c.phone ?? "")
    setEmail(c.email ?? "")
    setOptIn(c.reminders_opt_in ?? true)
  }

  function submit() {
    if (!name.trim()) { toast.error("Customer name is required"); return }
    if (!branchId) { toast.error("Select a branch"); return }
    if (!when) { toast.error("Pick a date and time"); return }
    if (!selectedSlug) { toast.error("Add a service in Settings → Services first"); return }

    const serviceLabel = services.find((s) => s.slug === selectedSlug)?.label

    startTransition(async () => {
      try {
        const res = await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: customerId,
            customer_name: name,
            customer_phone: phone || undefined,
            customer_email: email || undefined,
            branch_id: branchId,
            service: selectedSlug,
            service_label: serviceLabel,
            scheduled_at: new Date(when).toISOString(),
            duration_minutes: duration,
            assigned_to: assignee || null,
            notes: notes || undefined,
            parent_appointment_id: prefill?.parent_appointment_id,
            reminders_opt_in: optIn,
          }),
        })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(json.error ?? "Failed to book")
        toast.success("Appointment booked")
        await qc.invalidateQueries({ queryKey: ["appointments"] })
        onBooked?.()
        onOpenChange(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book appointment</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Customer */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Customer</p>
            <div className="relative">
              <Label className="text-sm font-medium">Full name *</Label>
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); setCustomerId(undefined) }}
                placeholder="e.g. Jane Wanjiku"
                className="mt-1.5 h-10"
                autoFocus
              />
              {hits.length > 0 && !customerId && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-lg max-h-48 overflow-y-auto">
                  {hits.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickCustomer(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--pt-muted)] flex justify-between gap-2"
                    >
                      <span className="font-medium">{c.full_name}</span>
                      <span className="text-[var(--pt-text-tertiary)]">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Phone</Label>
                <Input value={phone} onChange={(e) => { setPhone(e.target.value); setCustomerId(undefined) }} placeholder="07XX XXX XXX" className="mt-1.5 h-10" />
              </div>
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" className="mt-1.5 h-10" />
              </div>
            </div>
            {customerId && (
              <p className="text-xs text-[var(--pt-green-600)]">Using existing customer record · <button type="button" className="underline" onClick={() => setCustomerId(undefined)}>new instead</button></p>
            )}
          </div>

          {/* Appointment */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Appointment</p>
            <div>
              <Label className="text-sm font-medium">Service *</Label>
              <select value={selectedSlug} onChange={(e) => setService(e.target.value)} className={`mt-1.5 ${selectCls}`}>
                {services.length === 0 && <option value="">No services — add them in Settings → Services</option>}
                {services.map((s) => <option key={s.id} value={s.slug}>{s.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Date &amp; time *</Label>
                <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1.5 h-10" />
              </div>
              <div>
                <Label className="text-sm font-medium">Duration (min)</Label>
                <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 15)} className="mt-1.5 h-10" />
              </div>
              <div>
                <Label className="text-sm font-medium">Branch *</Label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`mt-1.5 ${selectCls}`}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium">Assigned to</Label>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={`mt-1.5 ${selectCls}`}>
                  <option value="">Unassigned</option>
                  {assignable.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="optional" className="mt-1.5 w-full rounded-lg border border-[var(--pt-border)] px-3 py-2 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]" />
            </div>
          </div>

          {/* Messaging opt-in */}
          <label className="flex items-start justify-between gap-3 p-3 rounded-lg border border-[var(--pt-border)] cursor-pointer hover:bg-[var(--pt-muted)]">
            <span>
              <span className="text-sm font-medium block">Send appointment reminders</span>
              <span className="text-xs text-[var(--pt-text-secondary)]">
                A reminder goes out the day before — WhatsApp or SMS to the customer (plus email if available) and SMS to the assigned pharmacist. Messaging may be charged — turn off to skip for this customer.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={optIn}
              onClick={() => setOptIn((v) => !v)}
              className={`mt-0.5 w-10 h-5 rounded-full transition-colors shrink-0 ${optIn ? "bg-[var(--pt-green)]" : "bg-[var(--pt-border-strong)]"}`}
            >
              <span className={`block w-3.5 h-3.5 rounded-full bg-white shadow mx-0.5 transition-transform ${optIn ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </label>
        </div>

        <div className="flex gap-2 pt-4 border-t border-[var(--pt-border)] mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={pending} className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
            {pending ? "Booking…" : "Book appointment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
