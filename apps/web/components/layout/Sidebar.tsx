"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  PackagePlus,
  Pill,
  Truck,
  Users,
  Clock,
  Receipt,
  CalendarClock,
  ClipboardList,
  ClipboardCheck,
  RefreshCwOff,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Rocket,
  X,
} from "lucide-react"
import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useBranchScope } from "@/lib/hooks/useBranchScope"
import { hasFeature, type Feature, type Capability } from "@pharmatrack/core"
import { useUIStore } from "@/lib/store/uiStore"
import { useSessionStore } from "@/lib/store/sessionStore"
import { LogoutButton } from "@/components/LogoutButton"
import { ProgressRing, useSetupProgress } from "@/components/onboarding/SetupGuide"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** Shown when the user holds ANY of these permissions (omit = everyone). */
  permission?: Capability[]
  // When set, the item is hidden unless the org's plan includes this feature.
  feature?: Feature
}

// Grouped so 15 links scan quickly: selling, stock, patients, running the
// pharmacy. (One flat list put Sales far from the till and mixed stock pages
// with staff and settings.)
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: ["dashboard.view"], feature: "dashboard" },
  ] },
  { label: "Sell", items: [
    { label: "POS Terminal", href: "/pos", icon: ShoppingCart, permission: ["pos.sell"], feature: "pos" },
    { label: "Sales", href: "/sales", icon: Receipt },
    { label: "Shifts", href: "/shifts", icon: Clock, permission: ["shifts.view_all"] },
  ] },
  { label: "Stock", items: [
    { label: "Inventory", href: "/inventory", icon: Package, permission: ["products.view"], feature: "inventory" },
    { label: "Products", href: "/products", icon: Pill, permission: ["products.view"], feature: "inventory" },
    { label: "Receive stock", href: "/inventory/receive", icon: PackagePlus, permission: ["stock.receive"], feature: "inventory" },
    { label: "Purchase orders", href: "/purchase-orders", icon: ClipboardCheck, permission: ["purchasing.manage", "purchasing.receive"], feature: "inventory" },
    { label: "Suppliers", href: "/suppliers", icon: Truck, permission: ["products.view", "suppliers.manage"], feature: "inventory" },
  ] },
  { label: "Patients", items: [
    { label: "Appointments", href: "/appointments", icon: CalendarClock, permission: ["appointments.manage"], feature: "appointments" },
    { label: "Prescriptions", href: "/prescriptions", icon: ClipboardList, permission: ["prescriptions.manage"], feature: "prescriptions" },
  ] },
  { label: "Manage", items: [
    { label: "Reports", href: "/reports", icon: BarChart3, permission: ["reports.view"], feature: "reports" },
    { label: "Staff", href: "/staff", icon: Users, permission: ["staff.manage"] },
    { label: "Sync issues", href: "/sync-issues", icon: RefreshCwOff, permission: ["devices.manage"] },
    { label: "Settings", href: "/settings", icon: Settings },
  ] },
]

/** Open sync issues for the branch in view — the link only shows when there are some. */
function useOpenSyncIssues(enabled: boolean) {
  const { branchId, ready } = useBranchScope()
  const { data } = useQuery<number>({
    queryKey: ["sync-issues-count", branchId],
    enabled: enabled && ready,
    queryFn: async () => {
      const qs = new URLSearchParams({ status: "open", ...(branchId ? { branch_id: branchId } : {}) })
      const res = await fetch(`/api/sync-issues?${qs}`)
      if (!res.ok) return 0
      return ((await res.json()) as { issues?: unknown[] }).issues?.length ?? 0
    },
    staleTime: 5 * 60_000,
  })
  return data ?? 0
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

// Setup guide entry (ADR-019) for owners/managers: at the top with a progress
// ring while the pharmacy isn't selling yet, then quietly at the bottom.
function GettingStartedLink({ collapsed, active, onNavigate, placement }: {
  collapsed: boolean; active: boolean; onNavigate: () => void; placement: "top" | "bottom"
}) {
  const { data } = useSetupProgress()
  const p = data?.audience ? data.progress : undefined
  if (!p || (placement === "top") !== !p.ready) return null
  return (
    <Link
      href="/getting-started"
      onClick={onNavigate}
      title={collapsed ? `Getting started (${p.coreDone}/${p.coreTotal})` : undefined}
      className={[
        "flex items-center gap-3 rounded-lg px-3 h-9 text-[13.5px] font-medium transition-colors",
        active ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
          : p.ready ? "text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] hover:text-[var(--pt-text)]"
            : "text-[var(--pt-green-700)] bg-[var(--pt-green-50)]/60 hover:bg-[var(--pt-green-50)]",
        collapsed ? "lg:justify-center lg:px-0" : "",
      ].join(" ")}
    >
      {p.ready ? <Rocket size={18} className="shrink-0" /> : <ProgressRing done={p.coreDone} total={p.coreTotal} size={18} />}
      <span className={collapsed ? "lg:hidden" : ""}>Getting started</span>
      {!p.ready && <span className={`ml-auto text-[11px] font-bold tabular-nums ${collapsed ? "lg:hidden" : ""}`}>{p.coreDone}/{p.coreTotal}</span>}
    </Link>
  )
}

function GroupLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`px-3 mb-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--pt-text-tertiary)] ${className}`}>{children}</p>
}

export function Sidebar() {
  const pathname = usePathname()
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleSidebar)
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen)
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen)
  const profile = useSessionStore((s) => s.profile)
  const planCode = useSessionStore((s) => s.planCode)
  const permissions = useSessionStore((s) => s.permissions)

  const syncIssues = useOpenSyncIssues(permissions.includes("devices.manage"))
  // Show an item only when a role permission allows it AND the plan includes its feature.
  const allowed = (item: NavItem) =>
    (!item.permission || item.permission.some((c) => permissions.includes(c))) &&
    (!item.feature || hasFeature(planCode, item.feature)) &&
    // Sync issues: only while there's something to sort out (or you're on it).
    (item.href !== "/sync-issues" || syncIssues > 0 || pathname.startsWith("/sync-issues"))
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length > 0)

  // Escape closes the phone drawer.
  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileNavOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mobileNavOpen, setMobileNavOpen])

  return (
    <>
      {/* Mobile scrim */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}

      <aside
        aria-label="Main menu"
        className={[
          "relative flex flex-col shrink-0 border-r border-[var(--pt-border)] bg-[var(--pt-surface)] transition-all duration-200",
          // Mobile: fixed off-canvas drawer (always full width when shown)
          "fixed inset-y-0 left-0 z-50 w-60 lg:static lg:z-auto lg:translate-x-0",
          // Off-screen only below lg; desktop sidebar never gets a transform
          mobileNavOpen ? "translate-x-0" : "max-lg:-translate-x-full",
          // Desktop: collapsible rail
          collapsed ? "lg:w-16" : "lg:w-60",
        ].join(" ")}
      >
        {/* Logo */}
        <Link href="/dashboard" className={["flex items-center h-14 px-4 shrink-0 gap-2", collapsed ? "lg:justify-center lg:gap-0" : ""].join(" ")}>
          <div className="w-8 h-8 rounded-lg bg-[var(--pt-green)] flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className={["text-[15px] font-bold tracking-tight text-[var(--pt-text)]", collapsed ? "lg:hidden" : ""].join(" ")}>
            Pharma<span className="text-[var(--pt-green)]">Track</span>
          </span>
        </Link>
        {/* Close (phone drawer) */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close menu"
          className="lg:hidden absolute top-2 right-2 w-10 h-10 rounded-lg flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"
        >
          <X size={18} />
        </button>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-2 flex-1 py-2 overflow-y-auto">
          <GettingStartedLink placement="top" collapsed={collapsed} active={pathname === "/getting-started"} onNavigate={() => setMobileNavOpen(false)} />
          {groups.map((group, gi) => (
            <div key={group.label ?? "top"} className={gi > 0 ? "mt-3" : ""}>
              {group.label && (
                collapsed
                  ? <><div className="hidden lg:block mx-3 mb-1.5 border-t border-[var(--pt-border)]" /><GroupLabel className="lg:hidden">{group.label}</GroupLabel></>
                  : <GroupLabel>{group.label}</GroupLabel>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  // "Receive stock" lives under /inventory — don't light Inventory up too.
                  const active = pathname === item.href || (pathname.startsWith(item.href + "/") && !(item.href === "/inventory" && pathname.startsWith("/inventory/receive")))
                  const badge = item.href === "/sync-issues" && syncIssues > 0 ? syncIssues : null
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "relative flex items-center gap-3 rounded-lg px-3 h-10 lg:h-9 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
                          : "text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] hover:text-[var(--pt-text)]",
                        collapsed ? "lg:justify-center lg:px-0" : "",
                      ].join(" ")}
                    >
                      <item.icon size={18} className="shrink-0" />
                      <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
                      {badge !== null && (
                        <span className={`ml-auto min-w-5 h-5 px-1.5 rounded-full bg-[var(--pt-red)] text-white text-[11px] font-bold flex items-center justify-center tabular-nums ${collapsed ? "lg:absolute lg:top-0.5 lg:right-1 lg:min-w-4 lg:h-4 lg:text-[10px]" : ""}`}>
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
          <GettingStartedLink placement="bottom" collapsed={collapsed} active={pathname === "/getting-started"} onNavigate={() => setMobileNavOpen(false)} />
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex mx-auto mb-2 w-7 h-7 rounded-full border border-[var(--pt-border)] bg-[var(--pt-surface)] items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* User footer */}
        <div className="border-t border-[var(--pt-border)] px-3 py-3 flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
            style={{ background: "var(--pt-green-50)", color: "var(--pt-green-600)" }}
          >
            {initials(profile?.full_name ?? "?")}
          </div>
          <div className={["contents", collapsed ? "lg:hidden" : ""].join(" ")}>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate">{profile?.full_name}</p>
              <p className="text-[11px] text-[var(--pt-text-secondary)] capitalize">{profile?.role}</p>
            </div>
            <LogoutButton
              title="Sign out"
              aria-label="Sign out"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text)] hover:bg-[var(--pt-muted-strong)] transition-colors"
            >
              <LogOut size={15} />
            </LogoutButton>
          </div>
        </div>
      </aside>
    </>
  )
}
