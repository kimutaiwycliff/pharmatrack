import type { Role } from "./helpers"

// Cost price / margin / profit are business-sensitive — only the owner and
// manager should see them. Pharmacists and cashiers can still ENTER a cost
// while receiving stock or creating a product (that's a one-off transaction
// value, not browsing the catalogue's economics), but can't view it back.
export function canViewCost(role: Role): boolean {
  return role === "owner" || role === "manager"
}

// A pharmacist receiving stock legitimately needs the product's last cost
// prefilled (an entry aid for a write they're already trusted to make), even
// though they can't browse it elsewhere. Callers pass `?context=receive` from
// the receiving flow only — never from POS/product-browsing call sites.
export function canViewCostInContext(role: Role, context: string | null): boolean {
  if (canViewCost(role)) return true
  return context === "receive" && role === "pharmacist"
}

export function omitCost<T extends { cost_price?: unknown }>(row: T): Omit<T, "cost_price"> {
  const { cost_price: _cost_price, ...rest } = row
  return rest
}
