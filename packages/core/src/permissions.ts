// ─────────────────────────────────────────────────────────────────────────────
// Role permissions — the SINGLE SOURCE OF TRUTH for what each staff role can do.
//
// Every capability has a default set of roles that reproduces the app's
// original hard-coded behaviour. An org's owner can then flip individual
// (role, capability) cells from Settings → Roles & permissions; only those
// overrides are stored (table `role_permission`), so a new capability added
// here is picked up by every tenant automatically with its default.
//
// The owner role is never configurable: it always holds every capability, so
// an org can't lock itself out of its own settings.
//
// Pure + isomorphic — web server, web client and mobile all import this.
// ─────────────────────────────────────────────────────────────────────────────

export type StaffRole = "owner" | "manager" | "pharmacist" | "cashier"

export const STAFF_ROLES: readonly StaffRole[] = ["owner", "manager", "pharmacist", "cashier"]

/** Roles whose permissions the owner may edit. */
export const CONFIGURABLE_ROLES: readonly StaffRole[] = ["manager", "pharmacist", "cashier"]

export type PermissionGroup =
  | "Sales & POS"
  | "Shifts"
  | "Products & catalogue"
  | "Inventory & purchasing"
  | "Customers & clinical"
  | "Reports & insights"
  | "Staff & administration"

interface CapabilityDef {
  group: PermissionGroup
  label: string
  description: string
  defaults: readonly StaffRole[]
  /** Other capabilities this one is meaningless without — the matrix UI turns
   *  these on alongside it, and turns this off when one of them goes off. */
  requires?: readonly string[]
}

const ALL: readonly StaffRole[] = ["owner", "manager", "pharmacist", "cashier"]
const OMP: readonly StaffRole[] = ["owner", "manager", "pharmacist"]
const OM: readonly StaffRole[] = ["owner", "manager"]
const O: readonly StaffRole[] = ["owner"]

export const CAPABILITIES = {
  // ── Sales & POS ────────────────────────────────────────────────────────────
  "pos.sell": { group: "Sales & POS", label: "Sell at the till", description: "Open the POS, ring up sales and take payment.", defaults: ALL },
  "pos.discount": { group: "Sales & POS", label: "Give discounts", description: "Apply discounts at the till, up to each product's maximum discount.", defaults: ALL, requires: ["pos.sell"] },
  "sales.view_all": { group: "Sales & POS", label: "See everyone's sales", description: "View sales made by other staff. Without this, staff only see their own sales.", defaults: OMP },

  // ── Shifts ─────────────────────────────────────────────────────────────────
  "shifts.view_all": { group: "Shifts", label: "View shift history", description: "Open the Shifts page with every staff member's shifts, floats and variances.", defaults: OM },
  "shifts.close_others": { group: "Shifts", label: "Force-close other people's shifts", description: "End a shift someone else left open (e.g. they forgot to clock out).", defaults: OM, requires: ["shifts.view_all"] },

  // ── Products & catalogue ───────────────────────────────────────────────────
  "products.view": { group: "Products & catalogue", label: "Browse products & inventory", description: "Open the back-office Products and Inventory pages.", defaults: OMP },
  "products.create": { group: "Products & catalogue", label: "Add products", description: "Create new products, pack sizes and categories, and upload product images.", defaults: OMP, requires: ["products.view"] },
  "products.edit": { group: "Products & catalogue", label: "Edit & deactivate products", description: "Change product details and selling prices, or deactivate/reactivate a product.", defaults: OMP, requires: ["products.view"] },
  "products.delete": { group: "Products & catalogue", label: "Delete unused products", description: "Delete a product that has never had stock or sales.", defaults: OM, requires: ["products.view"] },
  "products.delete_permanent": { group: "Products & catalogue", label: "Permanently delete products with history", description: "Erase a product along with its batches and stock adjustments. Past receipts keep the product name.", defaults: O, requires: ["products.delete"] },
  "cost.view": { group: "Products & catalogue", label: "See & edit cost prices", description: "View cost prices, margins and profit, and change product/batch costs.", defaults: OM },
  "categories.manage": { group: "Products & catalogue", label: "Rename & delete categories", description: "Rename and delete categories (anyone who can add products can create new ones).", defaults: OM, requires: ["products.view"] },
  "catalog.seed": { group: "Products & catalogue", label: "Load the drug catalog", description: "Seed/unseed the Kenyan essential medicines catalog and review seeded items.", defaults: OM, requires: ["products.view"] },

  // ── Inventory & purchasing ─────────────────────────────────────────────────
  "stock.receive": { group: "Inventory & purchasing", label: "Receive stock", description: "Add new batches (batch number, expiry, quantity) and bulk-import stock.", defaults: OMP, requires: ["products.view"] },
  "stock.adjust": { group: "Inventory & purchasing", label: "Adjust & write off stock", description: "Correct counts, record damage, expiry write-offs and losses.", defaults: OM, requires: ["products.view"] },
  "suppliers.manage": { group: "Inventory & purchasing", label: "Edit suppliers", description: "Edit supplier contact details (anyone who can receive stock can add a new supplier).", defaults: OM, requires: ["products.view"] },
  "purchasing.manage": { group: "Inventory & purchasing", label: "Create & send purchase orders", description: "Build restock orders, see the budget and send them to suppliers.", defaults: OM, requires: ["products.view"] },
  "purchasing.receive": { group: "Inventory & purchasing", label: "Receive purchase orders", description: "Check in deliveries against a purchase order and record their batches.", defaults: OMP, requires: ["stock.receive"] },

  // ── Customers & clinical ───────────────────────────────────────────────────
  "customers.manage": { group: "Customers & clinical", label: "Edit customers", description: "Update customer details, allergies and reminder preferences.", defaults: OMP },
  "appointments.manage": { group: "Customers & clinical", label: "Book & manage appointments", description: "Open Appointments, book, reschedule and cancel.", defaults: OMP },
  "appointment_services.manage": { group: "Customers & clinical", label: "Manage appointment services", description: "Edit the list of services and their recurrence intervals.", defaults: OM },
  "prescriptions.manage": { group: "Customers & clinical", label: "Manage prescriptions", description: "Open Prescriptions, record and update prescriptions (with interaction checks).", defaults: OMP },

  // ── Reports & insights ─────────────────────────────────────────────────────
  "dashboard.view": { group: "Reports & insights", label: "View dashboard", description: "See the dashboard KPIs, charts and alerts.", defaults: OMP },
  "reports.view": { group: "Reports & insights", label: "View reports", description: "Open sales, inventory, financial and controlled-substance reports and export CSVs.", defaults: OM },

  // ── Staff & administration ─────────────────────────────────────────────────
  "branches.all": { group: "Staff & administration", label: "Work across all branches", description: "Switch between branches and see every branch's data. Without this, staff are locked to their assigned branch.", defaults: OM },
  "staff.manage": { group: "Staff & administration", label: "Manage staff", description: "View staff, invite, change roles and branches, set PINs, suspend.", defaults: OM },
  "branches.manage": { group: "Staff & administration", label: "Edit branches", description: "Rename branches and change their details.", defaults: OM },
  "settings.organization": { group: "Staff & administration", label: "Organisation settings", description: "Edit the pharmacy's name, registration and contact details; add branches; M-Pesa setup.", defaults: O },
  "billing.manage": { group: "Staff & administration", label: "Billing & subscription", description: "View and pay for the PharmaTrack subscription.", defaults: O },
} as const satisfies Record<string, CapabilityDef>

export type Capability = keyof typeof CAPABILITIES

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as Capability[]

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  "Sales & POS",
  "Shifts",
  "Products & catalogue",
  "Inventory & purchasing",
  "Customers & clinical",
  "Reports & insights",
  "Staff & administration",
]

export function isCapability(value: string): value is Capability {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, value)
}

export function capabilityDef(cap: Capability): CapabilityDef {
  return CAPABILITIES[cap]
}

/** Capabilities `cap` depends on (see CapabilityDef.requires). */
export function capabilityRequires(cap: Capability): Capability[] {
  const def: CapabilityDef = CAPABILITIES[cap]
  return (def.requires ?? []).filter(isCapability)
}

/** One stored override row. */
export interface PermissionOverride {
  role: string
  capability: string
  allowed: boolean
}

/** Default allow/deny for a role before any org overrides. */
export function defaultAllows(role: StaffRole, cap: Capability): boolean {
  return (CAPABILITIES[cap].defaults as readonly StaffRole[]).includes(role)
}

/**
 * Effective capability list for a role: the defaults, with the org's overrides
 * for that role applied on top. Owner always gets everything. Unknown roles or
 * capabilities in stored overrides are ignored (a capability removed from this
 * file simply stops existing).
 */
export function resolvePermissions(role: string, overrides: readonly PermissionOverride[] = []): Capability[] {
  if (role === "owner") return [...CAPABILITY_KEYS]
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return []
  const r = role as StaffRole
  const allowed = new Set<Capability>(CAPABILITY_KEYS.filter((c) => defaultAllows(r, c)))
  for (const o of overrides) {
    if (o.role !== role || !isCapability(o.capability)) continue
    if (o.allowed) allowed.add(o.capability)
    else allowed.delete(o.capability)
  }
  return CAPABILITY_KEYS.filter((c) => allowed.has(c))
}

/** Full matrix (every role) — used by the settings screen. */
export function resolveMatrix(overrides: readonly PermissionOverride[]): Record<StaffRole, Capability[]> {
  return {
    owner: resolvePermissions("owner"),
    manager: resolvePermissions("manager", overrides),
    pharmacist: resolvePermissions("pharmacist", overrides),
    cashier: resolvePermissions("cashier", overrides),
  }
}

export function can(permissions: readonly Capability[] | null | undefined, cap: Capability): boolean {
  return !!permissions && permissions.includes(cap)
}

/** Capabilities that live in the back office (dashboard layout). A user with
 *  none of them is sent straight to the POS. */
const BACK_OFFICE: readonly Capability[] = [
  "dashboard.view", "products.view", "reports.view", "shifts.view_all",
  "staff.manage", "appointments.manage", "prescriptions.manage",
  "settings.organization", "purchasing.manage", "sales.view_all",
]

export function hasBackOfficeAccess(permissions: readonly Capability[]): boolean {
  return BACK_OFFICE.some((c) => permissions.includes(c))
}

/** Where a user lands after sign-in. */
export function homeRouteFor(permissions: readonly Capability[]): "/dashboard" | "/inventory" | "/sales" | "/pos" {
  if (permissions.includes("dashboard.view")) return "/dashboard"
  if (permissions.includes("products.view")) return "/inventory"
  if (!permissions.includes("pos.sell") && hasBackOfficeAccess(permissions)) return "/sales"
  return "/pos"
}

/**
 * Flip one capability in a role's effective set, keeping dependencies
 * consistent: turning a capability ON also turns on everything it requires;
 * turning it OFF also turns off everything that requires it. Shared by the
 * settings UI (instant preview) and the API (authoritative write).
 */
export function toggleCapability(current: readonly Capability[], cap: Capability, on: boolean): Capability[] {
  const set = new Set(current)
  const stack: Capability[] = [cap]
  while (stack.length > 0) {
    const c = stack.pop()!
    if (on) {
      if (set.has(c)) continue
      set.add(c)
      stack.push(...capabilityRequires(c))
    } else {
      if (!set.has(c)) continue
      set.delete(c)
      stack.push(...CAPABILITY_KEYS.filter((k) => capabilityRequires(k).includes(c)))
    }
  }
  return CAPABILITY_KEYS.filter((k) => set.has(k))
}

/** The minimal override rows that turn `role`'s defaults into `effective`. */
export function overridesFor(role: StaffRole, effective: readonly Capability[]): { capability: Capability; allowed: boolean }[] {
  const want = new Set(effective)
  return CAPABILITY_KEYS
    .filter((c) => defaultAllows(role, c) !== want.has(c))
    .map((c) => ({ capability: c, allowed: want.has(c) }))
}
