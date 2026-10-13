import { userMessage } from "../../../lib/errors"

// Pure wording for a failed checkout (vitest-tested). The commit is one
// SQLite transaction, so when it throws nothing was saved and the cart is
// untouched — the message says so, and never shows raw SQLite / developer text.

export const SALE_NOT_SAVED = "The sale was not saved. Your cart is still here — try again."

export function checkoutErrorMessage(err: unknown): string {
  // AllowanceError (commit-sale.ts): its message is written for people.
  if (err instanceof Error && typeof (err as { productId?: unknown }).productId === "string" && typeof (err as { available?: unknown }).available === "number") {
    return `${err.message}. Lower the quantity in the cart and try again.`
  }
  // Offline Edition's stock check (repo/sales.ts).
  const stock = err instanceof Error ? /^Insufficient stock for (.+?):/.exec(err.message) : null
  if (stock) return `Not enough ${stock[1]} in stock. Lower the quantity in the cart and try again.`
  return userMessage(err, SALE_NOT_SAVED)
}
