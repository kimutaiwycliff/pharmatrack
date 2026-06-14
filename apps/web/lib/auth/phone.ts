/**
 * Normalize a Kenyan phone number to canonical E.164 (`+2547XXXXXXXX`).
 *
 * Accepts the formats people actually type — with/without the country code,
 * a leading 0, spaces, dashes, or parentheses:
 *   "712345678", "712 345 678", "0712345678", "254712345678", "+254712345678"
 * all collapse to "+254712345678".
 *
 * Must be used on BOTH sides — when storing a phone and when looking one up
 * for PIN login — or the exact-match query silently fails.
 *
 * Anything it can't confidently interpret is returned cleaned (digits with a
 * leading "+") rather than mangled, so non-KE numbers still round-trip.
 */
export function normalizeKePhone(raw: string | null | undefined): string {
  let s = String(raw ?? "").replace(/[\s\-()]/g, "")
  if (!s) return ""
  if (s.startsWith("+")) s = s.slice(1)
  if (/^0\d{9}$/.test(s)) {
    // local format: 0712345678 -> 254712345678
    s = "254" + s.slice(1)
  } else if (/^[17]\d{8}$/.test(s)) {
    // bare national significant number: 712345678 / 1XXXXXXXX -> 254...
    s = "254" + s
  }
  return "+" + s
}
