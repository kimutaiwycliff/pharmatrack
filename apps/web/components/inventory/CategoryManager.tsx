"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, Check, X, Loader2, FolderTree, CornerDownRight } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { CategoryNode } from "./CategorySelect"

async function fetchCategories(): Promise<CategoryNode[]> {
  const res = await fetch("/api/categories")
  if (!res.ok) return []
  return ((await res.json()) as { categories: CategoryNode[] }).categories ?? []
}

async function api(method: string, path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(json.error ?? "Request failed")
  }
}

export function CategoryManager({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 30_000 })

  const topLevel = useMemo(() => categories.filter((c) => !c.parent_id), [categories])
  const childrenOf = useMemo(() => {
    const m = new Map<string, CategoryNode[]>()
    for (const c of categories) if (c.parent_id) m.set(c.parent_id, [...(m.get(c.parent_id) ?? []), c])
    return m
  }, [categories])

  const [newTop, setNewTop] = useState("")
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
  const [newSub, setNewSub] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>, after?: () => void) {
    setBusy(true)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ["categories"] })
      after?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  const addTop = () => {
    const name = newTop.trim()
    if (!name) return
    void run(() => api("POST", "/api/categories", { name, parent_id: null }), () => { setNewTop(""); toast.success(`Added "${name}"`) })
  }
  const addSub = (parentId: string) => {
    const name = newSub.trim()
    if (!name) return
    void run(() => api("POST", "/api/categories", { name, parent_id: parentId }), () => { setNewSub(""); setAddingSubFor(null); toast.success(`Added "${name}"`) })
  }
  const rename = (id: string) => {
    const name = editName.trim()
    if (!name) return
    void run(() => api("PATCH", `/api/categories/${id}`, { name }), () => { setEditing(null); toast.success("Renamed") })
  }
  const remove = (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? Products in it become uncategorized.`)) return
    void run(() => api("DELETE", `/api/categories/${id}`), () => toast.success("Deleted"))
  }

  function NameRow({ node, isSub }: { node: CategoryNode; isSub?: boolean }) {
    if (editing === node.id) {
      return (
        <div className="flex items-center gap-2 flex-1">
          <input
            autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") rename(node.id); if (e.key === "Escape") setEditing(null) }}
            className="flex-1 h-8 rounded-md border border-[var(--pt-green)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          />
          <button onClick={() => rename(node.id)} disabled={busy} className="h-8 w-8 rounded-md bg-[var(--pt-green)] text-white flex items-center justify-center disabled:opacity-50"><Check size={14} /></button>
          <button onClick={() => setEditing(null)} className="h-8 w-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)]"><X size={14} /></button>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-between flex-1 group">
        <span className={isSub ? "text-sm text-[var(--pt-text-secondary)] flex items-center gap-1.5" : "text-sm font-semibold"}>
          {isSub && <CornerDownRight size={13} className="text-[var(--pt-text-tertiary)]" />}
          {node.name}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isSub && (
            <button onClick={() => { setAddingSubFor(node.id); setNewSub("") }} title="Add subcategory" className="h-7 w-7 rounded-md hover:bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-green-600)]"><Plus size={14} /></button>
          )}
          <button onClick={() => { setEditing(node.id); setEditName(node.name) }} title="Rename" className="h-7 w-7 rounded-md hover:bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-secondary)]"><Pencil size={13} /></button>
          <button onClick={() => remove(node.id, node.name)} title="Delete" className="h-7 w-7 rounded-md hover:bg-red-50 dark:hover:bg-red-500/15 flex items-center justify-center text-[var(--pt-red)]"><Trash2 size={13} /></button>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderTree size={18} /> Manage Categories</DialogTitle>
        </DialogHeader>

        {/* Add top-level */}
        <div className="flex items-center gap-2">
          <input
            value={newTop} onChange={(e) => setNewTop(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTop() }}
            placeholder="New category name"
            className="flex-1 h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          />
          <button onClick={addTop} disabled={busy || !newTop.trim()} className="h-10 px-4 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />} Add
          </button>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1 divide-y divide-[var(--pt-border)]">
          {topLevel.length === 0 && (
            <p className="text-sm text-[var(--pt-text-tertiary)] py-8 text-center">No categories yet — add your first above.</p>
          )}
          {topLevel.map((cat) => (
            <div key={cat.id} className="py-2.5">
              <div className="flex items-center px-2 py-1 rounded-lg hover:bg-[var(--pt-muted)]"><NameRow node={cat} /></div>
              <div className="ml-3 mt-1 space-y-0.5">
                {(childrenOf.get(cat.id) ?? []).map((sub) => (
                  <div key={sub.id} className="flex items-center px-2 py-1 rounded-lg hover:bg-[var(--pt-muted)]"><NameRow node={sub} isSub /></div>
                ))}
                {addingSubFor === cat.id && (
                  <div className="flex items-center gap-2 px-2 py-1">
                    <input
                      autoFocus value={newSub} onChange={(e) => setNewSub(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addSub(cat.id); if (e.key === "Escape") setAddingSubFor(null) }}
                      placeholder="New subcategory name"
                      className="flex-1 h-9 rounded-md border border-[var(--pt-green)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
                    />
                    <button onClick={() => addSub(cat.id)} disabled={busy || !newSub.trim()} className="h-9 w-9 rounded-md bg-[var(--pt-green)] text-white flex items-center justify-center disabled:opacity-50"><Check size={14} /></button>
                    <button onClick={() => setAddingSubFor(null)} className="h-9 w-9 rounded-md border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)]"><X size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
