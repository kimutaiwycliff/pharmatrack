"use client"

import { useState } from "react"
import { Loader2, Eye, EyeOff, KeyRound, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Profile } from "@pharmatrack/types"

interface Props {
  profile: Profile
  hasPin: boolean
}

export function ProfileSettingsForm({ profile, hasPin }: Props) {
  const [form, setForm] = useState({
    full_name: profile.full_name,
    phone: profile.phone ?? "",
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" })
  const [showPw, setShowPw] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)

  const [pinForm, setPinForm] = useState({ password: "", pin: "", confirm: "" })
  const [pinSaving, setPinSaving] = useState(false)
  const [pinSet, setPinSet] = useState(hasPin)
  // PIN login matches by the saved phone number, so it must already be on file.
  const phoneOnFile = !!(profile.phone && profile.phone.trim())

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
    if (!pwForm.current) {
      toast.error("Enter your current password")
      return
    }
    setPwSaving(true)
    try {
      const { error } = await authClient.changePassword({
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
        revokeOtherSessions: true,
      })
      if (error) throw new Error(error.message)
      toast.success("Password changed successfully")
      setPwForm({ current: "", next: "", confirm: "" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setPwSaving(false)
    }
  }

  async function savePin() {
    if (!/^\d{4}$/.test(pinForm.pin)) { toast.error("PIN must be exactly 4 digits"); return }
    if (pinForm.pin !== pinForm.confirm) { toast.error("PINs do not match"); return }
    if (!pinForm.password) { toast.error("Enter your account password to confirm"); return }
    setPinSaving(true)
    try {
      const res = await fetch("/api/settings?target=pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pinForm.password, pin: pinForm.pin }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to set PIN")
      toast.success(pinSet ? "PIN updated" : "PIN set — you can now sign in with it")
      setPinForm({ password: "", pin: "", confirm: "" })
      setPinSet(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setPinSaving(false)
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
          <div className="h-10 px-3 flex items-center rounded-lg border border-[var(--pt-border)] bg-[var(--pt-muted)] text-sm capitalize text-[var(--pt-text-secondary)]">
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

      {/* Quick PIN login */}
      <div className="border-t border-[var(--pt-border)] pt-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-[var(--pt-text-secondary)]" />
          <h3 className="text-sm font-bold">Quick PIN Login</h3>
          {pinSet && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--pt-green-600)] bg-[var(--pt-green-50)] px-2 py-0.5 rounded-full">
              <CheckCircle2 size={12} /> Set
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--pt-text-secondary)] -mt-2">
          Sign in fast on a shared terminal with your phone number and a 4-digit PIN.
        </p>

        {!phoneOnFile ? (
          <p className="text-sm text-[var(--pt-text-secondary)] bg-[var(--pt-muted)] px-3 py-2.5 rounded-lg">
            Add and save your phone number above first — PIN login signs you in by phone.
          </p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
                Account Password
              </label>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Confirm it's you"
                value={pinForm.password}
                onChange={(e) => setPinForm((f) => ({ ...f, password: e.target.value }))}
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
                  {pinSet ? "New PIN" : "PIN"}
                </label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="4 digits"
                  value={pinForm.pin}
                  onChange={(e) => setPinForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  className="h-10 tracking-[0.4em] font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
                  Confirm PIN
                </label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Repeat"
                  value={pinForm.confirm}
                  onChange={(e) => setPinForm((f) => ({ ...f, confirm: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  className="h-10 tracking-[0.4em] font-mono"
                />
              </div>
            </div>

            <Button
              variant="outline"
              onClick={savePin}
              disabled={pinSaving || pinForm.pin.length !== 4 || pinForm.confirm.length !== 4 || !pinForm.password}
              className="w-full sm:w-auto"
            >
              {pinSaving ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
              {pinSet ? "Update PIN" : "Set PIN"}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
