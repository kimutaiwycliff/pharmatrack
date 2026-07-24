"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Bell, AlertTriangle, Clock, CreditCard } from "lucide-react"
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
  lowStock: { product_id: string; name: string; stock_on_hand: number; reorder_level: number }[]
  expiring: { product_id: string; name: string; earliest_expiry: string; daysUntil: number }[]
  trialEndingSoon: { trial_ends_at: string; daysLeft: number } | null
}

export function NotificationsMenu({ branchId }: { branchId: string | undefined }) {
  const router = useRouter()

  const { data } = useQuery<NotificationsData>({
    queryKey: ["notifications", branchId],
    queryFn: async () => {
      const res = await fetch(`/api/notifications?branch_id=${branchId}`)
      if (!res.ok) return { lowStock: [], expiring: [], trialEndingSoon: null }
      return res.json() as Promise<NotificationsData>
    },
    enabled: !!branchId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  const lowStock = data?.lowStock ?? []
  const expiring = data?.expiring ?? []
  const trial = data?.trialEndingSoon ?? null
  const count = lowStock.length + expiring.length + (trial ? 1 : 0)
  const hasAny = count > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-lg border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors outline-none"
      >
        <Bell size={16} />
        {hasAny && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--pt-red)] text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-72 max-h-96 overflow-y-auto">
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
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {lowStock.length > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Low stock</DropdownMenuLabel>
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
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {expiring.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Expiring soon</DropdownMenuLabel>
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
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
