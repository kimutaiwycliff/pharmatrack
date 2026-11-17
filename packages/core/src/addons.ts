// Paid add-ons (ADR-021). Separate from plan features: a tenant on any plan
// can buy one, billed flat per tenant per month. Prices live in the `addon`
// table so the operator can change them without a release.

export type AddonCode = "cashier_station"

export const ADDON_CODES: readonly AddonCode[] = ["cashier_station"]

export const ADDON_LABELS: Record<AddonCode, string> = {
  cashier_station: "Cashier station",
}

export function isAddonCode(x: string | null | undefined): x is AddonCode {
  return !!x && (ADDON_CODES as readonly string[]).includes(x)
}
