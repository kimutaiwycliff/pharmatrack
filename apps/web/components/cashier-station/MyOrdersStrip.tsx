"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { Bell, BellOff, RotateCw } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { postJson } from "@/lib/api/fetcher"
import { playPaidChime, useStationModeStore, type StationOrder } from "@/lib/cashier-station/client"

// The order desk's own orders today (ADR-021): waiting, paid, expired. When
// one is paid, a chime and a toast — the cashier has handed the goods over.
const STYLE: Record<StationOrder["status"], string> = {
  awaiting_payment: "border-amber-300 bg-amber-50 text-amber-900",
  paid: "border-[var(--pt-green)] bg-[var(--pt-green-50)] text-[var(--pt-green-700,#166534)]",
  expired: "border-[var(--pt-border)] bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]",
  cancelled: "border-[var(--pt-border)] bg-[var(--pt-muted)] text-[var(--pt-text-tertiary)] line-through",
}
const WORD: Record<StationOrder["status"], string> = { awaiting_payment: "Waiting", paid: "Paid", expired: "Expired", cancelled: "Cancelled" }

export function MyOrdersStrip({ branchId, online }: { branchId: string; online: boolean }) {
  const qc = useQueryClient()
  const chime = useStationModeStore((s) => s.chime)
  const setChime = useStationModeStore((s) => s.setChime)
  const { data } = useQuery<{ orders: StationOrder[] }>({
    queryKey: ["myOrders", branchId],
    queryFn: async () => {
      const r = await fetch(`/api/orders?branch_id=${branchId}&view=mine`)
      if (!r.ok) throw new Error("Couldn't load your orders")
      return r.json() as Promise<{ orders: StationOrder[] }>
    },
    enabled: online,
    refetchInterval: 5000,
  })
  const orders = data?.orders ?? []

  // Announce orders that became paid since the last poll (not on first load).
  const seen = useRef<Map<string, StationOrder["status"]> | null>(null)
  useEffect(() => {
    if (!data) return
    const prev = seen.current
    seen.current = new Map(data.orders.map((o) => [o.id, o.status]))
    if (!prev) return
    for (const o of data.orders) {
      if (o.status === "paid" && prev.get(o.id) && prev.get(o.id) !== "paid") {
        if (chime) playPaidChime()
        toast.success(`${o.label} paid`, { description: "The cashier has handed the goods over." })
      }
    }
  }, [data, chime])

  async function resend(o: StationOrder) {
    try {
      const out = await postJson<{ order: StationOrder }>(`/api/orders/${o.id}/resend`, {})
      toast.success(`Sent again as ${out.order.label}`)
      void qc.invalidateQueries({ queryKey: ["myOrders", branchId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send it again")
    }
  }

  if (orders.length === 0) return null
  return (
    <div className="shrink-0 flex items-center gap-2 overflow-x-auto px-3 py-2 border-b border-[var(--pt-border)] bg-[var(--pt-surface)]">
      <span className="text-xs font-semibold text-[var(--pt-text-secondary)] shrink-0">My orders</span>
      {orders.map((o) => (
        <span key={o.id} className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${STYLE[o.status]}`}>
          {o.label} · {WORD[o.status]}
          {o.status === "expired" && (
            <button onClick={() => void resend(o)} disabled={!online} className="inline-flex items-center gap-0.5 underline" title="Send it to the cashier again">
              <RotateCw size={11} />Resend
            </button>
          )}
        </span>
      ))}
      <button
        onClick={() => setChime(!chime)}
        className="ml-auto shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"
        title={chime ? "Mute the paid chime on this computer" : "Turn the paid chime on"}
        aria-label={chime ? "Mute paid chime" : "Unmute paid chime"}
      >
        {chime ? <Bell size={15} /> : <BellOff size={15} />}
      </button>
    </div>
  )
}
