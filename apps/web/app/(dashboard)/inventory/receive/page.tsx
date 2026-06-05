"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { StockReceiveForm } from "@/components/inventory/StockReceiveForm"
import { useUIStore } from "@/lib/store/uiStore"

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
  const branchId = useUIStore((s) => s.activeBranchId)

  const { data: suppliers = [] } = useSuppliers()

  if (!branchId) {
    return (
      <div className="flex flex-col items-center justify-center h-60 text-[var(--pt-text-tertiary)]">
        <p className="text-sm">No active branch selected.</p>
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
