"use client"

import { useState } from "react"
import { Loader2, X, KeyRound } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Props {
  member: { id: string; full_name: string; phone: string | null }
  onClose: () => void
}

export function SetPinDialog({ member, onClose }: Props) {
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState(member.phone ?? "")
  const [pin, setPin] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!phone.trim()) { toast.error("A phone number is required for PIN login"); return }
    if (!/^\d{4}$/.test(pin)) { toast.error("PIN must be exactly 4 digits"); return }
    if (pin !== confirm) { toast.error("PINs do not match"); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/staff/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), pin }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to set PIN")
      toast.success(`PIN set for ${member.full_name}`)
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
      <div className="bg-[var(--pt-surface)] rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <KeyRound size={17} className="text-[var(--pt-text-secondary)]" />
            <h2 className="text-lg font-bold">Set Quick-Login PIN</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
          {member.full_name} can then sign in with their phone number and this 4-digit PIN.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
              Phone *
            </label>
            <Input
              type="tel"
              placeholder="+254 7XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
                PIN
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="4 digits"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-10 tracking-[0.4em] font-mono"
                autoFocus
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
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-10 tracking-[0.4em] font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={loading || pin.length !== 4 || confirm.length !== 4 || !phone.trim()}
            className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white"
          >
            {loading ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
            Set PIN
          </Button>
        </div>
      </div>
    </div>
  )
}
