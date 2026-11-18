"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useQuery } from "@tanstack/react-query"
import { useSessionStore } from "@/lib/store/sessionStore"

// Client side of the cashier station (ADR-021): whether this branch runs one,
// which role this computer plays, and the "paid" chime.

export interface StationStatus { available: boolean; hold_minutes: number; direct_sale: boolean }

/** Whether the branch takes payment at a cashier station. Off (and no request)
 *  when `enabled` is false — e.g. on a registered offline till. */
export function useStationStatus(branchId: string | null | undefined, enabled = true) {
  return useQuery<StationStatus>({
    queryKey: ["cashierStation", branchId],
    enabled: enabled && !!branchId,
    queryFn: async () => {
      const r = await fetch(`/api/cashier-station/status?branch_id=${branchId}`)
      return r.ok ? (r.json() as Promise<StationStatus>) : { available: false, hold_minutes: 0, direct_sale: true }
    },
    staleTime: 60_000,
  })
}

export type StationMode = "desk" | "cashier"

interface ModeStore {
  /** Per branch: what this computer is. Unset → ask once. */
  modes: Record<string, StationMode>
  /** Chime when one of this desk's orders is paid. */
  chime: boolean
  setMode: (branchId: string, mode: StationMode) => void
  setChime: (on: boolean) => void
}

export const useStationModeStore = create<ModeStore>()(
  persist(
    (set) => ({
      modes: {},
      chime: true,
      setMode: (branchId, mode) => set((s) => ({ modes: { ...s.modes, [branchId]: mode } })),
      setChime: (on) => set({ chime: on }),
    }),
    { name: "pt-cashier-station" },
  ),
)

/** What this computer does in a cashier-station branch, given the user's
 *  permissions. `null` while the branch doesn't use the station (normal till). */
export function useStationRole(branchId: string | null | undefined, status: StationStatus | undefined) {
  const permissions = useSessionStore((s) => s.permissions)
  const chosen = useStationModeStore((s) => (branchId ? s.modes[branchId] : undefined))
  const canSend = permissions.includes("orders.send")
  const canCollect = permissions.includes("orders.collect")
  if (!status?.available || !branchId || (!canSend && !canCollect)) return { role: null, canSend, canCollect }
  // Someone who can only send is always an order desk; only collectors choose.
  const role: StationMode | "choose" = !canCollect ? "desk" : !canSend ? "cashier" : chosen ?? "choose"
  return { role, canSend, canCollect }
}

/** A short two-tone chime (no audio file to ship or cache). */
export function playPaidChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[880, 1320].forEach((hz, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = hz
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.15 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.15 + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.32)
    })
    window.setTimeout(() => void ctx.close(), 1000)
  } catch {
    // Sound is a nicety; the toast still shows.
  }
}

/** One order as the API returns it (lib/cashier-station/orders.ts orderOut). */
export interface StationOrder {
  id: string
  branch_id: string
  number: number
  label: string
  status: "awaiting_payment" | "paid" | "cancelled" | "expired"
  sent_by: string | null
  sent_by_name: string | null
  sale_id: string | null
  subtotal: number
  discount_amount: number
  total_amount: number
  customer_name: string | null
  customer_phone: string | null
  expires_at: string
  created_at: string
  line_count?: number
  lines?: Array<{
    id: string; product_id: string | null; product_name: string; product_strength: string | null
    base_unit: string; is_controlled: boolean; quantity: number; pack_size_id: string | null; unit_count: number | null
    unit_price: number; discount_percent: number; line_total: number
  }>
}
