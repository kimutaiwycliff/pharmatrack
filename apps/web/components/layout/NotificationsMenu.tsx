"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { notifyDesktop } from "@/lib/desktop/notify"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, AlertTriangle, AlarmClock, ClipboardList, Clock, CreditCard, Phone, Tag, MonitorSmartphone, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

interface NotificationsData {
  lowStock: { product_id: string; key: string; name: string; stock_on_hand: number; reorder_level: number }[]
  expiring: { product_id: string; key: string; name: string; earliest_expiry: string; daysUntil: number }[]
  totals?: { lowStock: number; expiring: number }
  /** key → "new" | "seen" for each alert shown (dismissed/snoozed ones are left out). */
  status?: Record<string, "new" | "seen">
  /** key → the alert's current version, sent back when marking it. */
  fps?: Record<string, string>
  trialEndingSoon: { trial_ends_at: string; daysLeft: number } | null
  needsPrice?: number
  toCall?: number
  devicesWaiting?: number
  stockTake?: { waiting: number; dueShelf: { name: string; products: number } | null }
}

export function NotificationsMenu({ branchId, ready }: { branchId: string | null; ready: boolean }) {
  const router = useRouter()
  const qc = useQueryClient()
  // Alerts that were new when the bell was opened keep their dot while it's open.
  const [openedNew, setOpenedNew] = useState<Set<string>>(new Set())

  const { data } = useQuery<NotificationsData>({
    queryKey: ["notifications", branchId],
    queryFn: async () => {
      const res = await fetch(`/api/notifications${branchId ? `?branch_id=${branchId}` : ""}`)
      if (!res.ok) return { lowStock: [], expiring: [], trialEndingSoon: null }
      return res.json() as Promise<NotificationsData>
    },
    enabled: ready,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  const lowStock = data?.lowStock ?? []
  const expiring = data?.expiring ?? []
  const trial = data?.trialEndingSoon ?? null
  const needsPrice = data?.needsPrice ?? 0
  const toCall = data?.toCall ?? 0
  // Someone may be standing at a new till waiting for approval (ADR-018), so
  // check that more often than the rest of the bell. 403 = not an approver.
  const { data: waitingNow } = useQuery<number>({
    queryKey: ["device-requests-count"],
    queryFn: async () => {
      const res = await fetch("/api/device-requests")
      if (!res.ok) return 0
      return ((await res.json()) as { requests: unknown[] }).requests.length
    },
    enabled: ready && (data?.devicesWaiting !== undefined),
    refetchInterval: 30_000,
    retry: false,
  })
  const devicesWaiting = waitingNow ?? data?.devicesWaiting ?? 0
  // A new request while the owner works elsewhere: an OS notification too
  // (desktop app: even from the tray).
  const lastWaiting = useRef<number | null>(null)
  useEffect(() => {
    if (waitingNow === undefined) return
    if (lastWaiting.current !== null && waitingNow > lastWaiting.current) {
      void notifyDesktop("A device is waiting for approval", "Someone is waiting at a new device. Approve it in Settings → Devices, or enter your PIN on that device.")
    }
    lastWaiting.current = waitingNow
  }, [waitingNow])
  const countsWaiting = data?.stockTake?.waiting ?? 0
  const dueShelf = data?.stockTake?.dueShelf ?? null
  const count = lowStock.length + expiring.length + (trial ? 1 : 0) + (needsPrice > 0 ? 1 : 0) + (toCall > 0 ? 1 : 0) + (devicesWaiting > 0 ? 1 : 0) + (countsWaiting > 0 ? 1 : 0) + (dueShelf ? 1 : 0)
  const hasAny = count > 0
  const status = data?.status ?? {}
  const fps = data?.fps ?? {}
  // The badge counts only alerts this person hasn't seen yet (or that changed).
  const newCount = Object.values(status).filter((v) => v === "new").length
    + (waitingNow !== undefined && waitingNow > (data?.devicesWaiting ?? 0) && status.devices !== "new" ? 1 : 0)

  async function act(action: "seen" | "dismiss" | "snooze_day" | "restore", keys: string[], refresh = true) {
    const items = action === "restore" ? [{ key: "*", fp: "" }] : keys.filter((k) => fps[k] !== undefined).map((k) => ({ key: k, fp: fps[k]! }))
    if (items.length === 0) return
    await fetch("/api/notifications/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, items }) }).catch(() => undefined)
    if (refresh) void qc.invalidateQueries({ queryKey: ["notifications"] })
  }
  function onOpenChange(open: boolean) {
    if (open) {
      const fresh = Object.keys(status).filter((k) => status[k] === "new")
      setOpenedNew(new Set(fresh))
      if (fresh.length) void act("seen", fresh, false)
    } else {
      void qc.invalidateQueries({ queryKey: ["notifications"] })
    }
  }
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation() }
  const tools = (k: string) => (
    <span className="ml-auto flex items-center gap-0.5 shrink-0 pl-2" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      {openedNew.has(k) && <span aria-label="New" title="New" className="size-2 rounded-full bg-[var(--pt-green)] mr-1" />}
      <button type="button" aria-label="Remind me tomorrow" title="Remind me tomorrow" onClick={(e) => { stop(e); void act("snooze_day", [k]) }}
        className="p-1 rounded text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text)] hover:bg-[var(--pt-muted-strong)]"><AlarmClock size={13} /></button>
      <button type="button" aria-label="Dismiss" title="Dismiss — it comes back if it changes" onClick={(e) => { stop(e); void act("dismiss", [k]) }}
        className="p-1 rounded text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text)] hover:bg-[var(--pt-muted-strong)]"><X size={13} /></button>
    </span>
  )

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-lg border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors outline-none"
      >
        <Bell size={16} />
        {newCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--pt-red)] text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {newCount > 9 ? "9+" : newCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-72 max-h-96 overflow-y-auto">
        {hasAny && (
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-[var(--pt-border)] mb-1">
            <span className="text-xs font-semibold text-[var(--pt-text-secondary)]">Notifications</span>
            <span className="flex gap-3 text-xs font-semibold">
              <button type="button" className="text-[var(--pt-green-600)] hover:underline" onClick={(e) => { stop(e); setOpenedNew(new Set()); void act("seen", Object.keys(fps)) }}>Mark all read</button>
              <button type="button" className="text-[var(--pt-text-secondary)] hover:underline" onClick={(e) => { stop(e); void act("dismiss", Object.keys(fps)) }}>Clear all</button>
            </span>
          </div>
        )}
        {!hasAny && (
          <div className="px-2 py-4 text-center text-sm text-[var(--pt-text-secondary)]">
            You&apos;re all caught up
          </div>
        )}

        {trial && (
          <>
            <DropdownMenuItem
              className="gap-2 items-start py-2"
              onClick={() => router.push("/settings")}
            >
              <CreditCard size={15} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">
                  {trial.daysLeft === 0 ? "Trial ends today" : `Trial ends in ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"}`}
                </p>
                <p className="text-xs text-[var(--pt-text-tertiary)]">Tap to review billing</p>
              </div>
            {tools("trial")}</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {lowStock.length > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex justify-between">Low stock<span className="font-normal text-[var(--pt-text-tertiary)]">{(data?.totals?.lowStock ?? lowStock.length)}</span></DropdownMenuLabel>
              {lowStock.map((p) => (
                <DropdownMenuItem
                  key={p.product_id}
                  className="gap-2 items-start py-2"
                  onClick={() => router.push("/inventory")}
                >
                  <AlertTriangle size={15} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-[var(--pt-text-tertiary)]">
                      {p.stock_on_hand} left · reorder at {p.reorder_level}
                    </p>
                  </div>
                {tools(p.key)}</DropdownMenuItem>
              ))}
              {(data?.totals?.lowStock ?? 0) > lowStock.length && (
                <DropdownMenuItem className="justify-center text-xs font-semibold text-[var(--pt-green-600)]" onClick={() => router.push("/inventory")}>
                  Show all {data?.totals?.lowStock} in Inventory
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {devicesWaiting > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Devices</DropdownMenuLabel>
              <DropdownMenuItem className="gap-2 items-start py-2" onClick={() => router.push("/settings?tab=devices")}>
                <MonitorSmartphone size={15} className="mt-0.5 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{devicesWaiting} device{devicesWaiting === 1 ? "" : "s"} waiting for approval</p>
                  <p className="text-xs text-[var(--pt-text-tertiary)]">Someone is trying to sign in on a new device</p>
                </div>
              {tools("devices")}</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {(countsWaiting > 0 || dueShelf) && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Stock take</DropdownMenuLabel>
              {countsWaiting > 0 && (
                <DropdownMenuItem className="gap-2 items-start py-2" onClick={() => router.push("/inventory/stock-take")}>
                  <ClipboardList size={15} className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">{countsWaiting} count{countsWaiting === 1 ? "" : "s"} waiting for your approval</p>
                    <p className="text-xs text-[var(--pt-text-tertiary)]">Check the differences and post them</p>
                  </div>
                {tools("st-wait")}</DropdownMenuItem>
              )}
              {dueShelf && (
                <DropdownMenuItem className="gap-2 items-start py-2" onClick={() => router.push("/inventory/stock-take")}>
                  <ClipboardList size={15} className="mt-0.5 text-[var(--pt-green-600)] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">This week&apos;s stock take: {dueShelf.name}</p>
                    <p className="text-xs text-[var(--pt-text-tertiary)]">{dueShelf.products} product{dueShelf.products === 1 ? "" : "s"} · one shelf a week keeps stock right</p>
                  </div>
                {tools("st-due")}</DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {toCall > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Appointments</DropdownMenuLabel>
              <DropdownMenuItem className="gap-2 items-start py-2" onClick={() => router.push("/dashboard")}>
                <Phone size={15} className="mt-0.5 text-[var(--pt-green-600)] shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{toCall} client{toCall === 1 ? "" : "s"} to call</p>
                  <p className="text-xs text-[var(--pt-text-tertiary)]">Remind them about today&apos;s and tomorrow&apos;s appointments</p>
                </div>
              {tools("call")}</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {needsPrice > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Needs a price</DropdownMenuLabel>
              <DropdownMenuItem className="gap-2 items-start py-2" onClick={() => router.push("/products")}>
                <Tag size={15} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{needsPrice} product{needsPrice === 1 ? "" : "s"} without a price</p>
                  <p className="text-xs text-[var(--pt-text-tertiary)]">They can&apos;t be sold until priced</p>
                </div>
              {tools("price")}</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {expiring.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex justify-between">Expiring soon<span className="font-normal text-[var(--pt-text-tertiary)]">{(data?.totals?.expiring ?? expiring.length)}</span></DropdownMenuLabel>
            {expiring.map((p) => (
              <DropdownMenuItem
                key={p.product_id}
                className="gap-2 items-start py-2"
                onClick={() => router.push("/inventory")}
              >
                <Clock size={15} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-[var(--pt-text-tertiary)]">
                    {p.daysUntil === 0 ? "Expires today" : `Expires in ${p.daysUntil} day${p.daysUntil === 1 ? "" : "s"}`}
                  </p>
                </div>
              {tools(p.key)}</DropdownMenuItem>
            ))}
              {(data?.totals?.expiring ?? 0) > expiring.length && (
                <DropdownMenuItem className="justify-center text-xs font-semibold text-[var(--pt-green-600)]" onClick={() => router.push("/inventory")}>
                  Show all {data?.totals?.expiring} in Inventory
                </DropdownMenuItem>
              )}
          </DropdownMenuGroup>
        )}
        <div className="border-t border-[var(--pt-border)] mt-1 pt-1.5 pb-1 text-center">
          <button type="button" className="text-xs font-semibold text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] hover:underline" onClick={(e) => { stop(e); void act("restore", []) }}>
            Show dismissed alerts
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
