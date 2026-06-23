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
  CalendarClock,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { hasFeature, type Feature } from "@pharmatrack/core"
import { useUIStore } from "@/lib/store/uiStore"
import { useSessionStore } from "@/lib/store/sessionStore"
import { signOut } from "@/app/(auth)/login/actions"
import type { UserRole } from "@pharmatrack/types"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  roles: UserRole[]
  // When set, the item is hidden unless the org's plan includes this feature.
  feature?: Feature
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner", "manager", "pharmacist"], feature: "dashboard" },
  { label: "POS Terminal", href: "/pos", icon: ShoppingCart, roles: ["owner", "manager", "pharmacist", "cashier"], feature: "pos" },
  { label: "Inventory", href: "/inventory", icon: Package, roles: ["owner", "manager", "pharmacist"], feature: "inventory" },
  { label: "Products", href: "/products", icon: Pill, roles: ["owner", "manager", "pharmacist"], feature: "inventory" },
  { label: "Stock Receive", href: "/inventory/receive", icon: PackagePlus, roles: ["owner", "manager", "pharmacist"], feature: "inventory" },
  { label: "Suppliers", href: "/suppliers", icon: Truck, roles: ["owner", "manager", "pharmacist"], feature: "inventory" },
  { label: "Appointments", href: "/appointments", icon: CalendarClock, roles: ["owner", "manager", "pharmacist"], feature: "appointments" },
  { label: "Prescriptions", href: "/prescriptions", icon: ClipboardList, roles: ["owner", "manager", "pharmacist"], feature: "prescriptions" },
  { label: "Staff", href: "/staff", icon: Users, roles: ["owner", "manager"] },
  { label: "Shifts", href: "/shifts", icon: Clock, roles: ["owner", "manager"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["owner", "manager"], feature: "reports" },
  { label: "Settings", href: "/settings", icon: Settings, roles: ["owner"] },
]

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

export function Sidebar() {
  const pathname = usePathname()
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleSidebar)
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen)
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen)
  const profile = useSessionStore((s) => s.profile)
  const planCode = useSessionStore((s) => s.planCode)
  const role = (profile?.role ?? "cashier") as UserRole

  // Show an item only when the role allows it AND the plan includes its feature.
  const visibleNav = NAV.filter(
    (item) => item.roles.includes(role) && (!item.feature || hasFeature(planCode, item.feature)),
  )

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
        className={[
          "flex flex-col shrink-0 border-r border-[var(--pt-border)] bg-[var(--pt-surface)] transition-all duration-200",
          // Mobile: fixed off-canvas drawer (always full width when shown)
          "fixed inset-y-0 left-0 z-50 w-60 lg:static lg:z-auto lg:translate-x-0",
          // Off-screen only below lg; desktop sidebar never gets a transform
          mobileNavOpen ? "translate-x-0" : "max-lg:-translate-x-full",
          // Desktop: collapsible rail
          collapsed ? "lg:w-16" : "lg:w-60",
        ].join(" ")}
      >
        {/* Logo */}
        <div className={["flex items-center h-14 px-4 shrink-0 gap-2", collapsed ? "lg:justify-center lg:gap-0" : ""].join(" ")}>
          <div className="w-8 h-8 rounded-lg bg-[var(--pt-green)] flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className={["text-[15px] font-bold tracking-tight text-[var(--pt-text)]", collapsed ? "lg:hidden" : ""].join(" ")}>
            Pharma<span className="text-[var(--pt-green)]">Track</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-2 flex-1 py-2 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                title={collapsed ? item.label : undefined}
                className={[
                  "flex items-center gap-3 rounded-lg px-3 h-9 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
                    : "text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] hover:text-[var(--pt-text)]",
                  collapsed ? "lg:justify-center lg:px-0" : "",
                ].join(" ")}
              >
                <item.icon size={18} className="shrink-0" />
                <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={toggle}
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
            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text)] hover:bg-[var(--pt-muted-strong)] transition-colors"
              >
                <LogOut size={15} />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  )
}
