"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { StockReceiveForm } from "@/components/inventory/StockReceiveForm"
import { useUIStore } from "@/lib/store/uiStore"
import { useBranchScope } from "@/lib/hooks/useBranchScope"

interface Supplier {
  id: string
  name: string
}

function useSuppliers() {
  return useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const res = await fetch("/api/suppliers")
      if (!res.ok) throw new Error("Failed to fetch suppliers")
      const json = (await res.json()) as { suppliers: Supplier[] }
      return json.suppliers
    },
    staleTime: 5 * 60_000,
  })
}

export default function ReceiveStockPage() {
  const router = useRouter()
  const { branchId, branches, ready } = useBranchScope()
  const setActiveBranch = useUIStore((s) => s.setActiveBranch)

  const { data: suppliers = [] } = useSuppliers()

  if (!ready) return null
  if (!branchId) {
    // "All branches" is selected — stock always lands in one branch.
    return (
      <div className="max-w-md mx-auto mt-10 bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-6">
        <h1 className="text-lg font-bold">Which branch is receiving this stock?</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1 mb-4">New batches are added to one branch&apos;s shelves.</p>
        <div className="space-y-2">
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => setActiveBranch(b.id)}
              className="w-full text-left px-4 py-3 rounded-lg border border-[var(--pt-border)] hover:border-[var(--pt-green)] hover:bg-[var(--pt-green-50)] text-sm font-semibold transition-colors"
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/inventory")}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors"
          aria-label="Back to inventory"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receive Stock</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            Scan barcodes or search to add incoming stock batches
          </p>
        </div>
      </div>

      <StockReceiveForm
        branchId={branchId}
        suppliers={suppliers}
        onPosted={() => router.push("/inventory")}
      />
    </div>
  )
}
