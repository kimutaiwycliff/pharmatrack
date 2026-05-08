"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Organization } from "@pharmatrack/types"

interface Props {
  org: Organization
  readonly: boolean
}

export function OrgSettingsForm({ org, readonly }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: org.name,
    registration_number: org.registration_number ?? "",
    phone: org.phone ?? "",
    email: org.email ?? "",
    address: org.address ?? "",
  })
  const [loading, setLoading] = useState(false)
  const [dirty, setDirty] = useState(false)

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Name is required"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/settings?target=org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          registration_number: form.registration_number || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to save")
      toast.success("Organization settings saved")
      setDirty(false)
      await queryClient.invalidateQueries({ queryKey: ["settings"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
          Organization Name *
        </label>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          className="h-10"
          disabled={readonly}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
          Registration Number
        </label>
        <Input
          placeholder="e.g. CPK/P/123"
          value={form.registration_number}
          onChange={(e) => set("registration_number", e.target.value)}
          className="h-10"
          disabled={readonly}
        />
        <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">
          Pharmacy / business registration number — printed on receipts
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
            disabled={readonly}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
            Email
          </label>
          <Input
            type="email"
            placeholder="info@pharmacy.co.ke"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className="h-10"
            disabled={readonly}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
          Address
        </label>
        <Input
          placeholder="Street, City, County"
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          className="h-10"
          disabled={readonly}
        />
      </div>

      {!readonly && (
        <Button onClick={save} disabled={loading || !dirty} className="w-full sm:w-auto">
          {loading ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
          Save Changes
        </Button>
      )}
    </div>
  )
}
