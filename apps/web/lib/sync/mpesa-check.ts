// Which offline M-Pesa sales go to Sync issues as "M-Pesa to confirm".
//
// A device records an M-Pesa sale as verified when Safaricom confirmed the
// payment prompt. Otherwise the cashier confirmed it by hand — and if they
// typed the M-Pesa code, the owner can check that code against the M-Pesa
// statement, so it is listed. With no code there is nothing to check, so it
// isn't listed (it only cluttered Sync issues); the sale is recorded either way.
export function needsMpesaCheck(sale: { payment_method: string; mpesa_verified?: boolean | null; mpesa_reference?: string | null }): boolean {
  if (sale.payment_method === "cash" || sale.mpesa_verified) return false
  return !!sale.mpesa_reference?.trim()
}
