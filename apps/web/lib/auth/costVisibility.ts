import type { Capability } from "@pharmatrack/core"

type PermissionHolder = { permissions: readonly Capability[] }

// Cost price / margin / profit are business-sensitive — gated by the
// `cost.view` permission (owner + manager by default). Staff without it can
// still ENTER a cost while receiving stock or creating a product (that's a
// one-off transaction value, not browsing the catalogue's economics), but
// can't view it back.
export function canViewCost(ctx: PermissionHolder): boolean {
  return ctx.permissions.includes("cost.view")
}

// Someone receiving stock legitimately needs the product's last cost
// prefilled (an entry aid for a write they're already trusted to make), even
// though they can't browse it elsewhere. Callers pass `?context=receive` from
// the receiving flow only — never from POS/product-browsing call sites.
export function canViewCostInContext(ctx: PermissionHolder, context: string | null): boolean {
  if (canViewCost(ctx)) return true
  return context === "receive" && ctx.permissions.includes("stock.receive")
}

export function omitCost<T extends { cost_price?: unknown }>(row: T): Omit<T, "cost_price"> {
  const { cost_price: _cost_price, ...rest } = row
  return rest
}
