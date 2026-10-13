// Pure wording for when the till can't add more of a product (vitest-tested).
// Online build: the phone sells from its own allowance; when that runs out the
// POS asks the server for more (a "top-up"). The cashier should know WHY a tap
// didn't add anything — no connection vs. genuinely nothing left.

/**
 * granted  — the server gave more (the add was retried; if it still didn't fit
 *            the cached branch stock is the limit);
 * none     — the server answered but had nothing more to give;
 * offline  — not connected, so no top-up was tried;
 * network  — the top-up request failed or timed out;
 * skipped  — no top-up applies (Offline Edition, nothing needed).
 */
export type TopUpOutcome = "granted" | "none" | "offline" | "network" | "skipped"

export function refusalMessage(opts: { offlineEdition: boolean; outcome: TopUpOutcome; name: string; available: number }): string {
  const { offlineEdition, outcome, name, available } = opts
  if (offlineEdition) return available > 0 ? `Only ${available} of ${name} in stock` : `${name} is out of stock`
  const base = available > 0 ? `Only ${available} of ${name} left on this device` : `${name}: none left on this device`
  if (outcome === "network") return `${base}. Couldn't reach the server to get more — check your connection and try again.`
  if (outcome === "offline") return `${base}. Connect to the internet to get more.`
  if (outcome === "none" || outcome === "granted") return available > 0 ? `Only ${available} of ${name} in stock for this branch` : `${name} is out of stock for this branch`
  return base
}
