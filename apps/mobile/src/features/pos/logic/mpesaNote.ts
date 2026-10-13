// Why the POS isn't offering M-Pesa prompts / Split (vitest-tested). Shown in
// the payment sheet so a missing tab is never a mystery.

export interface MpesaAvailabilityLike {
  available: boolean
  planAllowed: boolean
  configured: boolean
  /** True when the check itself failed (no connection, server error). */
  failed?: boolean
}

/** null = M-Pesa prompts are offered (or this is the Offline Edition). */
export function mpesaUnavailableNote(availability: MpesaAvailabilityLike | null, offlineEdition: boolean): string | null {
  if (offlineEdition) return null
  if (!availability) return "Checking whether M-Pesa prompts are available…"
  if (availability.available) return null
  if (availability.failed) return "Couldn't check whether M-Pesa prompts are available. Use Till/Paybill for now — we'll check again when you're online."
  if (!availability.planAllowed) return "M-Pesa prompts aren't included in your plan. Use Till/Paybill for M-Pesa payments."
  if (!availability.configured) return "M-Pesa prompts aren't set up for this pharmacy yet. Use Till/Paybill for M-Pesa payments."
  return "M-Pesa prompts aren't available right now. Use Till/Paybill for M-Pesa payments."
}
