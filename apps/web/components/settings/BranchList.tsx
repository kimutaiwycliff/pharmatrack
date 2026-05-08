"use client"

import { useState } from "react"
import { Plus, Pencil, Check, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Branch } from "@pharmatrack/types"

interface Props {
  branches: Branch[]
  isOwner: boolean
}

interface BranchFormState {
  name: string
  address: string
  phone: string
}

function BranchRow({
  branch,
  isOwner,
}: {
  branch: Branch
  isOwner: boolean
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<BranchFormState>({
    name: branch.name,
    address: branch.address ?? "",
    phone: branch.phone ?? "",
  })
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!form.name.trim()) { toast.error("Branch name is required"); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          address: form.address || undefined,
          phone: form.phone || undefined,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to update")
      toast.success("Branch updated")
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: ["settings"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive() {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !branch.is_active }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success(branch.is_active ? "Branch deactivated" : "Branch reactivated")
      await queryClient.invalidateQueries({ queryKey: ["settings"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  if (editing) {
    return (
      <div className="px-5 py-4 space-y-3 border-b border-[var(--pt-border)] last:border-b-0">
        <div className="grid grid-cols-3 gap-2">
          <Input
            placeholder="Branch name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="h-9 col-span-1"
            autoFocus
          />
          <Input
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className="h-9"
          />
          <Input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="h-9"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--pt-green)] text-white text-xs font-semibold hover:bg-[var(--pt-green-600)] transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Save
          </button>
          <button
            onClick={() => { setEditing(false); setForm({ name: branch.name, address: branch.address ?? "", phone: branch.phone ?? "" }) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--pt-border)] text-xs font-semibold text-[var(--pt-text-secondary)] hover:bg-gray-50 transition-colors"
          >
            <X size={12} />
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-between px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 ${!branch.is_active ? "opacity-50" : ""}`}>
      <div>
        <p className="text-sm font-semibold">{branch.name}</p>
        <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-0.5">
          {[branch.address, branch.phone].filter(Boolean).join(" · ") || "No contact info"}
        </p>
      </div>
      {isOwner && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-gray-100 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={toggleActive}
            disabled={loading}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
              branch.is_active
                ? "border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:bg-gray-50"
                : "border-[var(--pt-green-100)] text-[var(--pt-green-600)] bg-[var(--pt-green-50)] hover:bg-[var(--pt-green-100)]"
            }`}
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : branch.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      )}
    </div>
  )
}

function AddBranchRow({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState<BranchFormState>({ name: "", address: "", phone: "" })
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!form.name.trim()) { toast.error("Branch name is required"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/settings/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          address: form.address || undefined,
          phone: form.phone || undefined,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Branch created")
      setForm({ name: "", address: "", phone: "" })
      onAdded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-4 border-t border-[var(--pt-border)] space-y-3">
      <p className="text-xs font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">New Branch</p>
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="Branch name *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="h-9"
          autoFocus
        />
        <Input
          placeholder="Address"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          className="h-9"
        />
        <Input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="h-9"
        />
      </div>
      <Button onClick={submit} disabled={loading} size="sm" className="gap-1.5">
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        Add Branch
      </Button>
    </div>
  )
}

export function BranchList({ branches, isOwner }: Props) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--pt-text-secondary)]">
          {branches.length} branch{branches.length !== 1 ? "es" : ""}
        </p>
        {isOwner && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus size={13} />
            Add Branch
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[var(--pt-border)] overflow-hidden">
        {branches.length === 0 && !adding && (
          <div className="px-5 py-8 text-center text-sm text-[var(--pt-text-tertiary)]">
            No branches yet
          </div>
        )}
        {branches.map((b) => (
          <BranchRow key={b.id} branch={b} isOwner={isOwner} />
        ))}
        {adding && (
          <AddBranchRow
            onAdded={async () => {
              setAdding(false)
              await queryClient.invalidateQueries({ queryKey: ["settings"] })
            }}
          />
        )}
      </div>
    </div>
  )
}
