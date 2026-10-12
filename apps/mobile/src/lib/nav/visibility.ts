import { hasFeature, resolvePermissions, type Feature } from "@pharmatrack/core"

// R3: which tabs and More-menu entries a person sees, driven by capabilities
// (packages/core/src/permissions.ts) instead of hard-coded roles — the same
// rule as web's Sidebar: an item shows when the user holds ANY of its
// capabilities AND the org's plan includes its feature. Unavailable items are
// hidden, never shown disabled. Pure (no React Native) so it's unit-tested.

export type TabName = "pos" | "shifts" | "dashboard" | "inventory" | "appointments" | "more"

export type MenuHref =
  | "/sales"
  | "/purchase-orders"
  | "/products"
  | "/categories"
  | "/suppliers"
  | "/catalog-seed"
  | "/inventory-import"
  | "/prescriptions"
  | "/shift-history"
  | "/staff"
  | "/reports"
  | "/sync-issues"
  | "/sync"
  | "/billing"
  | "/settings"

export interface NavContext {
  permissions: readonly string[]
  planCode: string | null
  /** ADR-014 Offline Edition build — no server, so online-only items go. */
  offline: boolean
}

interface Gate {
  /** Shown when the user holds ANY of these (omit = everyone). */
  anyOf?: readonly string[]
  feature?: Feature
  /** Needs the server (hidden in the Offline Edition). */
  onlineOnly?: boolean
}

export interface TabDef extends Gate {
  name: TabName
  title: string
  icon: string
}

export interface MenuItemDef extends Gate {
  label: string
  icon: string
  href: MenuHref
  section: "Selling" | "Stock" | "Clinical" | "Insights" | "Admin"
}

// Order = tab bar order. Shifts is the till's clock-in/out screen, so anyone
// who sells (or reviews shifts) gets it. Cashiers never see the dashboard
// (revenue) — dashboard.view is owner/manager/pharmacist by default.
export const TABS: readonly TabDef[] = [
  { name: "pos", title: "POS", icon: "storefront-outline", anyOf: ["pos.sell"], feature: "pos" },
  { name: "dashboard", title: "Dashboard", icon: "stats-chart-outline", anyOf: ["dashboard.view"], feature: "dashboard" },
  { name: "inventory", title: "Inventory", icon: "cube-outline", anyOf: ["products.view"], feature: "inventory" },
  { name: "shifts", title: "Shift", icon: "time-outline", anyOf: ["pos.sell", "shifts.view_all"] },
  { name: "appointments", title: "Appointments", icon: "calendar-outline", anyOf: ["appointments.manage"], feature: "appointments" },
  { name: "more", title: "More", icon: "ellipsis-horizontal-circle-outline" },
]

export const MENU_ITEMS: readonly MenuItemDef[] = [
  { section: "Selling", label: "Sales history", icon: "receipt-outline", href: "/sales" },
  { section: "Selling", label: "Shift history", icon: "time-outline", href: "/shift-history", anyOf: ["shifts.view_all"], onlineOnly: true },
  { section: "Stock", label: "Products", icon: "medkit-outline", href: "/products", anyOf: ["products.view"], feature: "inventory" },
  { section: "Stock", label: "Purchase orders", icon: "clipboard-outline", href: "/purchase-orders", anyOf: ["purchasing.manage", "purchasing.receive"], feature: "inventory", onlineOnly: true },
  { section: "Stock", label: "Categories", icon: "folder-outline", href: "/categories", anyOf: ["products.view"] },
  { section: "Stock", label: "Suppliers", icon: "business-outline", href: "/suppliers", anyOf: ["products.view", "suppliers.manage"], feature: "inventory" },
  { section: "Stock", label: "Drug catalog", icon: "medical-outline", href: "/catalog-seed", anyOf: ["catalog.seed"], feature: "inventory" },
  { section: "Stock", label: "Bulk import", icon: "cloud-upload-outline", href: "/inventory-import", anyOf: ["stock.receive"], feature: "inventory" },
  { section: "Clinical", label: "Prescriptions", icon: "document-text-outline", href: "/prescriptions", anyOf: ["prescriptions.manage"], feature: "prescriptions" },
  { section: "Insights", label: "Reports", icon: "bar-chart-outline", href: "/reports", anyOf: ["reports.view"], feature: "reports" },
  { section: "Admin", label: "Staff", icon: "people-outline", href: "/staff", anyOf: ["staff.manage"] },
  { section: "Admin", label: "Sync issues", icon: "alert-circle-outline", href: "/sync-issues", anyOf: ["devices.manage"], onlineOnly: true },
  { section: "Admin", label: "Sync & this device", icon: "sync-outline", href: "/sync", onlineOnly: true },
  { section: "Admin", label: "Billing", icon: "card-outline", href: "/billing", anyOf: ["billing.manage"], onlineOnly: true },
  { section: "Admin", label: "Settings", icon: "settings-outline", href: "/settings" },
]

export function passesGate(gate: Gate, ctx: NavContext): boolean {
  if (gate.onlineOnly && ctx.offline) return false
  if (gate.anyOf && !gate.anyOf.some((c) => ctx.permissions.includes(c))) return false
  if (gate.feature && !hasFeature(ctx.planCode, gate.feature)) return false
  return true
}

export function visibleTabs(ctx: NavContext): TabName[] {
  return TABS.filter((t) => passesGate(t, ctx)).map((t) => t.name)
}

export function visibleMenuItems(ctx: NavContext): MenuItemDef[] {
  return MENU_ITEMS.filter((m) => passesGate(m, ctx))
}

/** First tab a person lands on — mirrors core's homeRouteFor() for the tabs we have. */
export function homeTab(ctx: NavContext): TabName {
  const tabs = visibleTabs(ctx)
  for (const t of ["pos", "dashboard", "inventory", "shifts", "appointments"] as const) {
    if (tabs.includes(t)) return t
  }
  return "more"
}

/**
 * Effective capability list for whoever is using the device right now:
 * the selected staff member's roster permissions (R1) first, then the signed-in
 * session's, and — when neither carries a list (the Offline Edition, or a cache
 * written before permissions existed) — the role defaults from core.
 */
export function effectivePermissions(input: {
  staffPermissions?: readonly string[] | null
  sessionPermissions?: readonly string[] | null
  role?: string | null
}): string[] {
  if (input.staffPermissions && input.staffPermissions.length > 0) return [...input.staffPermissions]
  if (input.sessionPermissions && input.sessionPermissions.length > 0) return [...input.sessionPermissions]
  return input.role ? resolvePermissions(input.role) : []
}
