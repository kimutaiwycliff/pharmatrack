"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Pill, Search, SlidersHorizontal, X, ToggleLeft, ToggleRight, FolderTree } from "lucide-react"
import { toast } from "sonner"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { EditProductSheet } from "@/components/inventory/EditProductSheet"
import { NewProductDialog } from "@/components/inventory/NewProductDialog"
import { CategoryManager } from "@/components/inventory/CategoryManager"
import { formatKES } from "@/lib/store/cartStore"
import type { Product } from "@pharmatrack/types"

type ProductRow = Product & { category_name?: string }

async function fetchCategories(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch("/api/categories")
  if (!res.ok) return []
  const data = (await res.json()) as { categories: Array<{ id: string; name: string }> }
  return data.categories ?? []
}

async function fetchProducts(q: string, categoryId: string, page: number): Promise<{ products: ProductRow[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), limit: "30" })
  if (q.length >= 2) params.set("q", q)
  if (categoryId) params.set("category_id", categoryId)
  const res = await fetch(`/api/products?${params}`)
  if (!res.ok) throw new Error("Failed to load products")
  return res.json() as Promise<{ products: ProductRow[]; total: number }>
}

async function fetchSuppliers(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch("/api/suppliers")
  if (!res.ok) return []
  const data = (await res.json()) as { suppliers: Array<{ id: string; name: string }> }
  return data.suppliers ?? []
}

async function toggleActive(id: string, active: boolean): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: active }),
  })
  if (!res.ok) throw new Error("Failed to update product")
}

export default function ProductsPage() {
  const qc = useQueryClient()
  const [rawSearch, setRawSearch] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [page, setPage] = useState(1)
  const [editId, setEditId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [catMgrOpen, setCatMgrOpen] = useState(false)
  const search = useDebounce(rawSearch, 300)

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  })

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
    staleTime: 5 * 60_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["products", search, categoryId, page],
    queryFn: () => fetchProducts(search, categoryId, page),
    staleTime: 60_000,
  })

  const categories = categoriesData ?? []
  const suppliers = suppliersData ?? []
  const products = data?.products ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 30)

  async function handleToggle(p: ProductRow) {
    try {
      await toggleActive(p.id, !p.is_active)
      await qc.invalidateQueries({ queryKey: ["products"] })
      toast.success(`${p.name} ${!p.is_active ? "activated" : "deactivated"}`)
    } catch {
      toast.error("Failed to update product")
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--pt-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[var(--pt-border)] shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[var(--pt-text)]">Products</h1>
          <p className="text-[13px] text-[var(--pt-text-secondary)] mt-0.5">
            {total} product{total !== 1 ? "s" : ""} in catalogue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCatMgrOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 h-9 rounded-lg border border-[var(--pt-border)] text-[var(--pt-text-secondary)] text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            <FolderTree size={16} />
            Manage categories
          </button>
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] transition-colors"
          >
            <Plus size={16} />
            Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-[var(--pt-border)] shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
          <input
            value={rawSearch}
            onChange={e => { setRawSearch(e.target.value); setPage(1) }}
            placeholder="Search name, brand, GTIN…"
            className="w-full pl-8 pr-8 h-9 text-sm rounded-lg border border-[var(--pt-border)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] bg-white"
          />
          {rawSearch && (
            <button onClick={() => setRawSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={14} className="text-[var(--pt-text-tertiary)]" />
          <select
            value={categoryId}
            onChange={e => { setCategoryId(e.target.value); setPage(1) }}
            className="h-9 text-sm rounded-lg border border-[var(--pt-border)] px-3 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] text-[var(--pt-text-secondary)]"
          >
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-[var(--pt-border)] overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-gray-100 rounded w-40" />
                  <div className="h-2.5 bg-gray-100 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--pt-border)] flex flex-col items-center justify-center py-20 text-[var(--pt-text-tertiary)]">
            <Pill size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm">No products found</p>
            {(rawSearch || categoryId) && (
              <button
                onClick={() => { setRawSearch(""); setCategoryId("") }}
                className="mt-3 text-[13px] text-[var(--pt-green)] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[var(--pt-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--pt-border)] bg-gray-50">
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden md:table-cell">Strength / Form</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden sm:table-cell">Sell Price</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">Cost</th>
                  <th className="px-4 py-3 text-center text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">Max Disc.</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden xl:table-cell">GTIN</th>
                  <th className="px-4 py-3 text-center text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 w-24 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr
                    key={p.id}
                    className={`border-b border-[var(--pt-border)] last:border-b-0 transition-colors hover:bg-gray-50/60 ${!p.is_active ? "opacity-50" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[var(--pt-border)]" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-[var(--pt-text-tertiary)] shrink-0">
                            <Pill size={15} />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-[13px] leading-tight">{p.name}</p>
                          {p.brand_name && p.brand_name !== p.name && (
                            <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-0.5">{p.brand_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] text-[13px] hidden md:table-cell">
                      {[p.strength, p.dosage_form].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[13px] hidden sm:table-cell">
                      {p.selling_price != null ? formatKES(p.selling_price) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[13px] text-[var(--pt-text-secondary)] hidden lg:table-cell">
                      {p.cost_price != null ? formatKES(p.cost_price) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-center text-[13px] hidden lg:table-cell">
                      {p.max_discount_percent != null
                        ? <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold">{p.max_discount_percent}%</span>
                        : <span className="text-[var(--pt-text-tertiary)]">—</span>
                      }
                    </td>
                    <td className="px-4 py-3.5 text-[var(--pt-text-tertiary)] font-mono text-[12px] hidden xl:table-cell">
                      {p.gtin ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        p.is_active
                          ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                      }`}>
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditId(p.id)}
                          className="px-2.5 h-7 rounded-md text-[12px] font-medium text-[var(--pt-text-secondary)] border border-[var(--pt-border)] hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggle(p)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-gray-100 transition-colors"
                          title={p.is_active ? "Deactivate" : "Activate"}
                        >
                          {p.is_active ? <ToggleRight size={16} className="text-[var(--pt-green)]" /> : <ToggleLeft size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-[var(--pt-text-secondary)]">
            <span>{total} products</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 h-8 rounded-lg border border-[var(--pt-border)] disabled:opacity-40 hover:bg-gray-50 transition-colors text-[13px]"
              >
                Previous
              </button>
              <span className="text-[13px]">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 h-8 rounded-lg border border-[var(--pt-border)] disabled:opacity-40 hover:bg-gray-50 transition-colors text-[13px]"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <EditProductSheet
        productId={editId}
        onClose={() => setEditId(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["products"] })}
      />

      {newOpen && (
        <NewProductDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          branchId=""
          suppliers={suppliers}
          onCreated={(_product) => {
            setNewOpen(false)
            void qc.invalidateQueries({ queryKey: ["products"] })
          }}
        />
      )}

      <CategoryManager open={catMgrOpen} onOpenChange={setCatMgrOpen} />
    </div>
  )
}
