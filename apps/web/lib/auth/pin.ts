import bcrypt from "bcryptjs"

/** A 4-digit PIN with all identical digits or a trivial run is too easy to guess. */
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "0123",
  "9876", "8765", "7654", "6543", "5432", "4321", "3210",
])

export type PinValidation = { ok: true; pin: string } | { ok: false; error: string }

/** Validate a raw PIN string: must be exactly 4 digits and not a trivial sequence. */
export function validatePin(raw: unknown): PinValidation {
  const pin = String(raw ?? "")
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: "PIN must be exactly 4 digits" }
  if (WEAK_PINS.has(pin)) return { ok: false, error: "Choose a less predictable PIN" }
  return { ok: true, pin }
}

/** bcrypt hash for storage in profiles.pin_hash (same cost factor as passwords elsewhere). */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}
