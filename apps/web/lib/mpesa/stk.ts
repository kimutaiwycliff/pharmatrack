// M-Pesa STK push outcomes — pure, shared by the callback, the status
// endpoint and the sale check. Daraja reports the result as a code, in the
// callback (number) and in the STK Query response (string).

export type StkStatus = "pending" | "paid" | "cancelled" | "failed"

export interface StkOutcome {
  status: StkStatus
  /** Plain words for the cashier. */
  message: string
}

const MESSAGES: Record<string, StkOutcome> = {
  "0": { status: "paid", message: "Paid" },
  "1032": { status: "cancelled", message: "The customer cancelled the M-Pesa prompt." },
  "1037": { status: "failed", message: "No answer from the customer's phone — it may be off or out of network, or the prompt timed out." },
  "1019": { status: "failed", message: "The prompt expired before the customer paid." },
  "2001": { status: "failed", message: "Wrong M-Pesa PIN entered." },
  "1": { status: "failed", message: "Not enough money in the customer's M-Pesa." },
  "1001": { status: "failed", message: "The customer has another M-Pesa payment in progress — wait a moment and try again." },
  "1025": { status: "failed", message: "M-Pesa couldn't send the prompt. Try again." },
  "9999": { status: "failed", message: "M-Pesa couldn't send the prompt. Try again." },
  // Still waiting on the customer (STK Query while the prompt is open).
  "4999": { status: "pending", message: "Waiting for the customer to enter their PIN." },
}

/** Map a Daraja ResultCode (number or string) to what the till should do. */
export function stkOutcome(resultCode: string | number | null | undefined, resultDesc?: string | null): StkOutcome {
  if (resultCode === null || resultCode === undefined || resultCode === "") {
    return { status: "pending", message: "Waiting for the customer to enter their PIN." }
  }
  const known = MESSAGES[String(resultCode).trim()]
  if (known) return known
  return { status: "failed", message: resultDesc?.trim() || `M-Pesa declined the payment (code ${resultCode}).` }
}

/**
 * STK Query answers with an error (not a ResultCode) while Safaricom is still
 * processing — "500.001.1001 The transaction is being processed". That means
 * keep waiting, not failed.
 */
export function queryStillProcessing(body: { errorCode?: string; errorMessage?: string; ResultCode?: string }): boolean {
  if (body.ResultCode === "4999") return true
  return body.errorCode === "500.001.1001" || /being processed|under processing/i.test(body.errorMessage ?? "")
}

export interface StkCallbackData {
  checkoutRequestId: string
  resultCode: number | null
  resultDesc: string | null
  receipt: string | null
  amount: number | null
  phone: string | null
}

/** Pull what we need out of Safaricom's callback body. Null if it isn't one. */
export function parseStkCallback(body: unknown): StkCallbackData | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } } | null)?.Body?.stkCallback
  if (!cb || typeof cb.CheckoutRequestID !== "string" || !cb.CheckoutRequestID) return null
  const items = ((cb.CallbackMetadata as { Item?: { Name?: string; Value?: unknown }[] } | undefined)?.Item) ?? []
  const item = (name: string) => items.find((i) => i?.Name === name)?.Value
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null)
  const receipt = item("MpesaReceiptNumber")
  const phone = item("PhoneNumber")
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: num(cb.ResultCode),
    resultDesc: typeof cb.ResultDesc === "string" ? cb.ResultDesc : null,
    receipt: typeof receipt === "string" && receipt ? receipt : null,
    amount: num(item("Amount")),
    phone: phone == null ? null : String(phone),
  }
}

/**
 * Can a paid STK request back this sale's M-Pesa part? It must be paid, not
 * already used on another sale, and cover the amount (Daraja charges whole
 * shillings — the push rounds up, so allow the push amount ≥ what's due).
 */
export function stkCoversSale(req: { status: string; sale_id: string | null; amount: number }, due: number): { ok: true } | { ok: false; reason: string } {
  if (req.status !== "paid") return { ok: false, reason: "That M-Pesa payment hasn't been confirmed yet." }
  if (req.sale_id) return { ok: false, reason: "That M-Pesa payment is already on another sale." }
  if (req.amount + 0.001 < due) return { ok: false, reason: `That M-Pesa payment (KES ${req.amount}) is less than the KES ${due} due.` }
  return { ok: true }
}
