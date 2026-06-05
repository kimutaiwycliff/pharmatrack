"use client"

import { useState } from "react"
import { Plus, Pencil, Check, X, Loader2, Truck } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Supplier } from "@pharmatrack/types"

const SUPPLIERS_KEY = ["suppliers", "manage"] as const

interface Props {
  suppliers: Supplier[]
  /** owner / manager — can edit and deactivate */
  canManage: boolean
  /** owner / manager / pharmacist — can add */
  canCreate: boolean
}

interface FormState {
  name: string
  phone: string
  email: string
  address: string
}

function SupplierRow({ supplier, canManage }: { supplier: Supplier; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<FormState>({
    name: supplier.name,
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
  })
  const [loading, setLoading] = useState(false)

  async function patch(body: Record<string, unknown>, success: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to update")
      toast.success(success)
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  function save() {
    if (!form.name.trim()) { toast.error("Supplier name is required"); return }
    void patch(
      { name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null },
      "Supplier updated",
    )
  }

  if (editing) {
    return (
      <div className="px-5 py-4 space-y-3 border-b border-[var(--pt-border)] last:border-b-0">
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Supplier name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-9" autoFocus />
          <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-9" />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-9" />
          <Input placeholder="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="h-9" />
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
            onClick={() => { setEditing(false); setForm({ name: supplier.name, phone: supplier.phone ?? "", email: supplier.email ?? "", address: supplier.address ?? "" }) }}
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
    <div className={`flex items-center justify-between px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 ${!supplier.is_active ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{supplier.name}</p>
        <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-0.5 truncate">
          {[supplier.phone, supplier.email, supplier.address].filter(Boolean).join(" · ") || "No contact info"}
        </p>
      </div>
      {canManage && (
        <div className="flex items-center gap-2 shrink-0">
          {supplier.is_active && (
            <button
              onClick={() => setEditing(true)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-gray-100 transition-colors"
              title="Edit supplier"
            >
              <Pencil size={13} />
            </button>
          )}
          <button
            onClick={() => patch({ is_active: !supplier.is_active }, supplier.is_active ? "Supplier deactivated" : "Supplier reactivated")}
            disabled={loading}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
              supplier.is_active
                ? "border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:bg-gray-50"
                : "border-[var(--pt-green-100)] text-[var(--pt-green-600)] bg-[var(--pt-green-50)] hover:bg-[var(--pt-green-100)]"
            }`}
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : supplier.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      )}
    </div>
  )
}

function AddSupplierRow({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState<FormState>({ name: "", phone: "", email: "", address: "" })
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!form.name.trim()) { toast.error("Supplier name is required"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Supplier created")
      setForm({ name: "", phone: "", email: "", address: "" })
      onAdded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-4 border-t border-[var(--pt-border)] space-y-3">
      <p className="text-xs font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">New Supplier</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Supplier name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-9" autoFocus />
        <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-9" />
        <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-9" />
        <Input placeholder="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="h-9" />
      </div>
      <Button onClick={submit} disabled={loading} size="sm" className="gap-1.5">
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        Add Supplier
      </Button>
    </div>
  )
}

export function SupplierList({ suppliers, canManage, canCreate }: Props) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const activeCount = suppliers.filter((s) => s.is_active).length

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--pt-text-secondary)]">
          {activeCount} active supplier{activeCount !== 1 ? "s" : ""}
          {suppliers.length > activeCount ? ` · ${suppliers.length - activeCount} inactive` : ""}
        </p>
        {canCreate && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus size={13} />
            Add Supplier
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[var(--pt-border)] overflow-hidden">
        {suppliers.length === 0 && !adding && (
          <div className="px-5 py-10 flex flex-col items-center text-center text-sm text-[var(--pt-text-tertiary)]">
            <Truck size={32} strokeWidth={1.5} className="mb-3" />
            No suppliers yet
          </div>
        )}
        {suppliers.map((s) => (
          <SupplierRow key={s.id} supplier={s} canManage={canManage} />
        ))}
        {adding && (
          <AddSupplierRow
            onAdded={async () => {
              setAdding(false)
              await queryClient.invalidateQueries({ queryKey: ["suppliers"] })
            }}
          />
        )}
      </div>
    </div>
  )
}

export { SUPPLIERS_KEY }
