"use client"

import { useState } from "react"
import { Loader2, Lock } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface Props {
  member: { id: string; full_name: string }
  onClose: () => void
}

// Owner/manager sets a staff member's dashboard login password directly. Their
// email is the username; no email round-trip needed.
export function SetPasswordDialog({ member, onClose }: Props) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return }
    if (password !== confirm) { toast.error("Passwords do not match"); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/staff/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to set password")
      toast.success(`Password set for ${member.full_name}`)
      await queryClient.invalidateQueries({ queryKey: ["staff"] })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md p-6">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={17} className="text-[var(--pt-text-secondary)]" />
          <h2 className="text-lg font-bold">Set Login Password</h2>
        </div>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
          {member.full_name} can sign in with their email and this password. Share it with
          them securely — they can change it later from their profile.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
              New password
            </label>
            <Input
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
              Confirm password
            </label>
            <Input
              type="password"
              placeholder="Repeat password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-10"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={loading || password.length < 8 || confirm.length < 8}
            className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white"
          >
            {loading ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
            Set Password
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
