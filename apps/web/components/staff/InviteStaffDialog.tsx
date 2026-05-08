"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Branch } from "@pharmatrack/types"

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "cashier", label: "Cashier" },
]

interface Props {
  branches: Branch[]
  onClose: () => void
}

export function InviteStaffDialog({ branches, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    role: "cashier" as "manager" | "pharmacist" | "cashier",
    branch_id: "",
    phone: "",
  })
  const [loading, setLoading] = useState(false)

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!form.email || !form.full_name) {
      toast.error("Name and email are required")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          full_name: form.full_name,
          role: form.role,
          branch_id: form.branch_id || null,
          phone: form.phone || undefined,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to invite")
      toast.success("Invitation sent — they'll receive an email to set their password")
      await queryClient.invalidateQueries({ queryKey: ["staff"] })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">Invite Staff Member</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-[var(--pt-text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
              Full Name *
            </label>
            <Input
              placeholder="Jane Mwangi"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              className="h-10"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
              Email Address *
            </label>
            <Input
              type="email"
              placeholder="jane@pharmacy.co.ke"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="h-10"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
              Phone
            </label>
            <Input
              type="tel"
              placeholder="+254 7XX XXX XXX"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
                Role *
              </label>
              <select
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                className="w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
                Branch
              </label>
              <select
                value={form.branch_id}
                onChange={(e) => set("branch_id", e.target.value)}
                className="w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin mr-1" /> : null}
            Send Invitation
          </Button>
        </div>
      </div>
    </div>
  )
}
