"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ClipboardCheck, Sparkles, Truck, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PoStatusBadge } from "@/components/purchasing/PoStatusBadge"
import { useBranchScope } from "@/lib/hooks/useBranchScope"
import { useCan } from "@/lib/store/sessionStore"
import { formatKES } from "@/lib/store/cartStore"
import type { PurchaseOrderDTO } from "@/lib/purchasing/serialize"

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Sent" },
  { key: "partially_received", label: "Partly received" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
] as const

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }) : "—"

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const { branchId, ready, isAll } = useBranchScope()
  const canManage = useCan("purchasing.manage")
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open")

  const { data, isLoading } = useQuery<{ orders: PurchaseOrderDTO[] }>({
    queryKey: ["purchase-orders", branchId, filter],
    enabled: ready,
    queryFn: async () => {
      const qs = new URLSearchParams({ status: filter, ...(branchId ? { branch_id: branchId } : {}) })
      const res = await fetch(`/api/purchase-orders?${qs}`)
      if (!res.ok) throw new Error("Failed to load purchase orders")
      return res.json() as Promise<{ orders: PurchaseOrderDTO[] }>
    },
  })
  const orders = data?.orders ?? []

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase orders</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            Plan restocks, send orders to suppliers and check deliveries in.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => router.push("/purchase-orders/new")} className="gap-2">
            <Sparkles size={15} /> Restock planner
          </Button>
        )}
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              filter === f.key
                ? "bg-[var(--pt-green)] text-white"
                : "bg-[var(--pt-muted)] text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading || !ready ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] flex flex-col items-center justify-center py-16 px-6 text-center">
          <ClipboardCheck size={36} strokeWidth={1.5} className="text-[var(--pt-text-tertiary)] mb-3" />
          <p className="font-semibold">No {filter === "all" ? "" : FILTERS.find((f) => f.key === filter)!.label.toLowerCase() + " "}purchase orders</p>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-1 max-w-sm">
            The restock planner looks at what&apos;s running low and how fast it sells, then drafts an order per supplier with a budget.
          </p>
          {canManage && (
            <Button className="mt-4 gap-2" onClick={() => router.push("/purchase-orders/new")}>
              <Sparkles size={15} /> Open restock planner
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden divide-y divide-[var(--pt-border)]">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/purchase-orders/${o.id}`}
              className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-[var(--pt-muted)]/60 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-secondary)] shrink-0">
                <Truck size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{o.supplier_name ?? "No supplier"}</span>
                  <PoStatusBadge status={o.status} />
                </div>
                <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5 truncate">
                  <span className="font-mono">{o.po_number}</span> · {o.item_count} item{o.item_count === 1 ? "" : "s"}
                  {isAll && o.branch_name ? ` · ${o.branch_name}` : ""} · created {day(o.created_at)}
                  {o.expected_date && o.status !== "received" ? ` · due ${day(o.expected_date)}` : ""}
                </p>
              </div>
              {o.total != null && <span className="text-sm font-semibold tabular-nums hidden sm:block">{formatKES(o.total)}</span>}
              <ChevronRight size={16} className="text-[var(--pt-text-tertiary)] shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
