// ─────────────────────────────────────────────────────────────────────────────
// Plan entitlements — the SINGLE SOURCE OF TRUTH for what each tier unlocks.
//
// To change gating you only ever edit THIS file:
//   • Add a capability        → add a key to `Feature`, then list it under the
//                               plans that include it in PLAN_MATRIX.
//   • Move a feature up/down  → cut its key from one plan's `features` and paste
//                               it into another. (Down-tiering is just as easy.)
//   • Change a limit          → edit the number (use Infinity for unlimited).
//
// Entitlements are derived from the org's live plan code at request time, so when
// an operator switches a tenant's plan the new gating takes effect immediately —
// nothing is cached or copied onto the tenant.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanCode = "starter" | "growth" | "enterprise"

/** Every gateable capability in the app. */
export type Feature =
  | "pos"             // point of sale terminal
  | "inventory"       // stock, batches, receiving, adjustments
  | "offline_pos"     // Dexie/IndexedDB offline selling
  | "mpesa"           // M-Pesa at the till (manual confirm — all tiers)
  | "mpesa_stk"       // M-Pesa STK push (auto-prompt the customer's phone) — Growth+
  | "dashboard"       // owner/manager home KPIs
  | "appointments"    // customers + appointments
  | "reminders"       // SMS / WhatsApp / email appointment reminders
  | "prescriptions"   // prescriptions + drug-utilisation review
  | "reports"         // analytics reports + CSV export
  | "multi_branch"    // more than one branch
  | "central_reporting" // cross-branch consolidated reporting
  | "etims"           // Phase 8 — KRA eTIMS
  | "sha"             // Phase 8 — SHA / NHIF claims

/** Numeric caps. Use Infinity for "unlimited". */
export type Limit = "branches" | "staff"

export interface PlanEntitlements {
  label: string
  features: readonly Feature[]
  limits: Record<Limit, number>
}

// Features shared by every paid tier (Starter is the floor). Higher tiers spread
// this and add their own, so "Everything in Starter" stays true by construction.
const STARTER_FEATURES = [
  "pos",
  "inventory",
  "offline_pos",
  "mpesa",
  "dashboard",
] as const satisfies readonly Feature[]

const GROWTH_FEATURES = [
  ...STARTER_FEATURES,
  "mpesa_stk",
  "appointments",
  "reminders",
  "prescriptions",
  "reports",
  "multi_branch",
] as const satisfies readonly Feature[]

export const PLAN_MATRIX: Record<PlanCode, PlanEntitlements> = {
  starter: {
    label: "Starter",
    features: STARTER_FEATURES,
    limits: { branches: 1, staff: 5 },
  },
  growth: {
    label: "Growth",
    features: GROWTH_FEATURES,
    limits: { branches: 3, staff: Infinity },
  },
  enterprise: {
    label: "Enterprise",
    features: [...GROWTH_FEATURES, "central_reporting", "etims", "sha"],
    limits: { branches: Infinity, staff: Infinity },
  },
}

/** Plan used when a tenant has no/unknown plan (e.g. mid-trial with no plan row). */
export const DEFAULT_PLAN: PlanCode = "starter"

export function isPlanCode(x: string | null | undefined): x is PlanCode {
  return x === "starter" || x === "growth" || x === "enterprise"
}

/** Coerce any plan code (incl. null/unknown) to a valid one. */
export function planOf(code: string | null | undefined): PlanCode {
  return isPlanCode(code) ? code : DEFAULT_PLAN
}

export function entitlements(code: string | null | undefined): PlanEntitlements {
  return PLAN_MATRIX[planOf(code)]
}

export function hasFeature(code: string | null | undefined, feature: Feature): boolean {
  return entitlements(code).features.includes(feature)
}

export function planLimit(code: string | null | undefined, limit: Limit): number {
  return entitlements(code).limits[limit]
}

/** True if a tenant on `code` may add another row given its `currentCount`. */
export function canAdd(code: string | null | undefined, limit: Limit, currentCount: number): boolean {
  return currentCount < planLimit(code, limit)
}
