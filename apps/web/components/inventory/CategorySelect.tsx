"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"

export interface CategoryNode {
  id: string
  name: string
  parent_id: string | null
}

async function fetchCategories(): Promise<CategoryNode[]> {
  const res = await fetch("/api/categories")
  if (!res.ok) return []
  const data = (await res.json()) as { categories: CategoryNode[] }
  return data.categories ?? []
}

async function createCategory(name: string, parentId: string | null): Promise<CategoryNode> {
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent_id: parentId }),
  })
  const json = (await res.json()) as { category?: CategoryNode; error?: string }
  if (!res.ok || !json.category) throw new Error(json.error ?? "Failed to create category")
  return json.category
}

const selectClass =
  "w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] disabled:bg-gray-50 disabled:text-[var(--pt-text-tertiary)]"

/**
 * Two-level category picker with inline "create new" for both the category and
 * its subcategory. `value` is the product's category_id — either a top-level
 * category id or a subcategory (leaf) id. `onChange` always returns the most
 * specific selection (subcategory if chosen, else the top-level category).
 */
export function CategorySelect({
  value,
  onChange,
}: {
  value: string | null | undefined
  onChange: (categoryId: string | null) => void
}) {
  const qc = useQueryClient()
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 60_000,
  })

  const topLevel = useMemo(() => categories.filter((c) => !c.parent_id), [categories])
  const childrenOf = useMemo(() => {
    const map = new Map<string, CategoryNode[]>()
    for (const c of categories) {
      if (c.parent_id) {
        const arr = map.get(c.parent_id) ?? []
        arr.push(c)
        map.set(c.parent_id, arr)
      }
    }
    return map
  }, [categories])

  // Resolve the current value into (topLevelId, subId)
  const selected = value ? categories.find((c) => c.id === value) : undefined
  const topLevelId = selected ? (selected.parent_id ?? selected.id) : ""
  const subId = selected?.parent_id ? selected.id : ""
  const subOptions = topLevelId ? (childrenOf.get(topLevelId) ?? []) : []

  // Inline-create state
  const [creating, setCreating] = useState<null | "category" | "subcategory">(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  async function saveNew() {
    const name = draft.trim()
    if (!name) return
    setSaving(true)
    try {
      const parentId = creating === "subcategory" ? topLevelId : null
      const created = await createCategory(name, parentId)
      await qc.invalidateQueries({ queryKey: ["categories"] })
      onChange(created.id)
      setCreating(null)
      setDraft("")
      toast.success(`Added ${creating === "subcategory" ? "subcategory" : "category"} "${name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  function InlineCreate({ placeholder }: { placeholder: string }) {
    return (
      <div className="flex items-center gap-2 mt-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void saveNew() }
            if (e.key === "Escape") { setCreating(null); setDraft("") }
          }}
          placeholder={placeholder}
          className="flex-1 h-10 rounded-lg border border-[var(--pt-green)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
        />
        <button
          type="button"
          onClick={() => void saveNew()}
          disabled={saving || !draft.trim()}
          className="h-10 w-10 shrink-0 rounded-lg bg-[var(--pt-green)] text-white flex items-center justify-center disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        </button>
        <button
          type="button"
          onClick={() => { setCreating(null); setDraft("") }}
          className="h-10 w-10 shrink-0 rounded-lg border border-[var(--pt-border)] text-[var(--pt-text-secondary)] flex items-center justify-center hover:bg-gray-50"
        >
          <X size={15} />
        </button>
      </div>
    )
  }

  const NEW = "__new__"

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Category */}
      <div>
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
          Category
        </label>
        {creating === "category" ? (
          <InlineCreate placeholder="New category name" />
        ) : (
          <select
            className={selectClass}
            disabled={isLoading}
            value={topLevelId}
            onChange={(e) => {
              const v = e.target.value
              if (v === NEW) { setCreating("category"); setDraft(""); return }
              onChange(v || null) // selecting a top-level clears any subcategory
            }}
          >
            <option value="">Uncategorized</option>
            {topLevel.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value={NEW}>+ New category…</option>
          </select>
        )}
      </div>

      {/* Subcategory */}
      <div>
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
          Subcategory
        </label>
        {creating === "subcategory" ? (
          <InlineCreate placeholder="New subcategory name" />
        ) : (
          <select
            className={selectClass}
            disabled={isLoading || !topLevelId}
            value={subId}
            onChange={(e) => {
              const v = e.target.value
              if (v === NEW) { setCreating("subcategory"); setDraft(""); return }
              onChange(v || topLevelId || null) // none → fall back to the top-level category
            }}
          >
            <option value="">{topLevelId ? "None" : "Pick a category first"}</option>
            {subOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            {topLevelId && <option value={NEW}>+ New subcategory…</option>}
          </select>
        )}
      </div>
    </div>
  )
}
