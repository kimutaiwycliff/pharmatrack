/**
 * Normalise a Kenyan phone number to the 2547XXXXXXXX MSISDN format used by
 * M-Pesa (Daraja) and Africa's Talking. Returns the raw digits if it can't
 * confidently normalise.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1)
  if (digits.startsWith("254")) return digits
  if (digits.length === 9) return "254" + digits
  return digits
}

/** Africa's Talking expects an E.164 number with a leading "+". */
export function toE164(raw: string): string {
  const msisdn = formatPhone(raw)
  return msisdn.startsWith("+") ? msisdn : "+" + msisdn
}
