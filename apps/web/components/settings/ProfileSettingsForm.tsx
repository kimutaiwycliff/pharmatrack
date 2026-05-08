"use client"

import { useState } from "react"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Profile } from "@pharmatrack/types"

interface Props {
  profile: Profile
}

export function ProfileSettingsForm({ profile }: Props) {
  const [form, setForm] = useState({
    full_name: profile.full_name,
    phone: profile.phone ?? "",
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" })
  const [showPw, setShowPw] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  async function saveProfile() {
    if (!form.full_name.trim()) { toast.error("Name is required"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/settings?target=profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name,
          phone: form.phone || undefined,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to save")
      toast.success("Profile updated")
      setDirty(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    if (!pwForm.next || pwForm.next.length < 8) {
      toast.error("New password must be at least 8 characters")
      return
    }
    if (pwForm.next !== pwForm.confirm) {
      toast.error("Passwords do not match")
      return
    }
    setPwSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: pwForm.next })
      if (error) throw error
      toast.success("Password changed successfully")
      setPwForm({ current: "", next: "", confirm: "" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="max-w-xl space-y-8">
      {/* Profile info */}
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
            Full Name *
          </label>
          <Input
            value={form.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
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
            onChange={(e) => setField("phone", e.target.value)}
            className="h-10"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
            Role
          </label>
          <div className="h-10 px-3 flex items-center rounded-lg border border-[var(--pt-border)] bg-gray-50 text-sm capitalize text-[var(--pt-text-secondary)]">
            {profile.role}
          </div>
          <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">Role is managed by your organization owner</p>
        </div>

        <Button onClick={saveProfile} disabled={saving || !dirty} className="w-full sm:w-auto">
          {saving ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
          Save Profile
        </Button>
      </div>

      {/* Password change */}
      <div className="border-t border-[var(--pt-border)] pt-6 space-y-5">
        <h3 className="text-sm font-bold">Change Password</h3>

        <div>
          <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
            New Password
          </label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              placeholder="Min. 8 characters"
              value={pwForm.next}
              onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
              className="h-10 pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text-secondary)]"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
            Confirm New Password
          </label>
          <Input
            type={showPw ? "text" : "password"}
            placeholder="Repeat new password"
            value={pwForm.confirm}
            onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
            className="h-10"
          />
        </div>

        <Button
          variant="outline"
          onClick={changePassword}
          disabled={pwSaving || !pwForm.next || !pwForm.confirm}
          className="w-full sm:w-auto"
        >
          {pwSaving ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
          Update Password
        </Button>
      </div>
    </div>
  )
}
