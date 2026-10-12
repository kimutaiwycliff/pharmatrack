// Pure state machine behind <NumericKeypad>: the value is a string of digits
// (whole KES or a whole quantity), never a float, so nothing is lost to
// rounding before it is turned into integer cents/units by the caller.

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "back" | "clear"

export function applyKeypadKey(value: string, key: KeypadKey, maxLength = 7): string {
  if (key === "clear") return ""
  if (key === "back") return value.slice(0, -1)
  // No leading zeros: "0" then "5" is "5"; "00" on an empty value is nothing.
  const next = value === "" || value === "0" ? key.replace(/^0+/, "") : value + key
  return next.slice(0, maxLength)
}

/** Digits → number (0 for empty). */
export const keypadNumber = (value: string): number => (value === "" ? 0 : Number(value))

/**
 * PIN entry on the same keypad: every digit counts (a PIN may start with 0),
 * "00" is not offered, and the value never grows past `maxLength`.
 */
export function applyPinKey(value: string, key: KeypadKey, maxLength = 8): string {
  if (key === "clear") return ""
  if (key === "back") return value.slice(0, -1)
  if (key === "00") return value
  return (value + key).slice(0, maxLength)
}
