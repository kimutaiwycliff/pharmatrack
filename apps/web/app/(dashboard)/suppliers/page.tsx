"use client"

import { useQuery } from "@tanstack/react-query"
import { SupplierList, SUPPLIERS_KEY } from "@/components/suppliers/SupplierList"
import { useCan } from "@/lib/store/sessionStore"
import type { Supplier } from "@pharmatrack/types"

function useSuppliers() {
  return useQuery<Supplier[]>({
    queryKey: SUPPLIERS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/suppliers?includeInactive=true")
      if (!res.ok) throw new Error("Failed to load suppliers")
      const json = (await res.json()) as { suppliers: Supplier[] }
      return json.suppliers
    },
    staleTime: 60_000,
  })
}

export default function SuppliersPage() {
  const canManage = useCan("suppliers.manage")
  const canReceive = useCan("stock.receive")
  const canAddProducts = useCan("products.create")
  const canCreate = canManage || canReceive || canAddProducts

  const { data: suppliers = [], isLoading } = useSuppliers()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
          Manage the suppliers you order stock from
        </p>
      </div>

      {isLoading ? (
        <div className="max-w-2xl bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
              <div className="h-3.5 bg-[var(--pt-muted-strong)] rounded w-40 mb-2" />
              <div className="h-2.5 bg-[var(--pt-muted-strong)] rounded w-56" />
            </div>
          ))}
        </div>
      ) : (
        <SupplierList suppliers={suppliers} canManage={canManage} canCreate={canCreate} />
      )}
    </div>
  )
}
