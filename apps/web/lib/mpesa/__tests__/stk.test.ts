import { describe, expect, it } from "vitest"
import { parseStkCallback, queryStillProcessing, stkCoversSale, stkOutcome } from "../stk"

describe("stkOutcome", () => {
  it("maps Daraja result codes (number or string)", () => {
    expect(stkOutcome(0).status).toBe("paid")
    expect(stkOutcome("0").status).toBe("paid")
    expect(stkOutcome(1032).status).toBe("cancelled")
    expect(stkOutcome("1037")).toMatchObject({ status: "failed", message: expect.stringMatching(/No answer/) })
    expect(stkOutcome(2001).message).toMatch(/Wrong M-Pesa PIN/)
    expect(stkOutcome(1).message).toMatch(/Not enough money/)
    expect(stkOutcome("4999").status).toBe("pending")
    expect(stkOutcome(null).status).toBe("pending")
  })
  it("falls back to Safaricom's own words for unknown codes", () => {
    expect(stkOutcome(17, "Rule limited.")).toEqual({ status: "failed", message: "Rule limited." })
    expect(stkOutcome(17).message).toMatch(/code 17/)
  })
})

describe("queryStillProcessing", () => {
  it("treats 'being processed' and 4999 as still waiting", () => {
    expect(queryStillProcessing({ errorCode: "500.001.1001", errorMessage: "The transaction is being processed" })).toBe(true)
    expect(queryStillProcessing({ ResultCode: "4999" })).toBe(true)
    expect(queryStillProcessing({ ResultCode: "1037" })).toBe(false)
    expect(queryStillProcessing({ errorCode: "400.002.02", errorMessage: "Bad Request - Invalid CheckoutRequestID" })).toBe(false)
  })
})

describe("parseStkCallback", () => {
  it("reads a successful callback", () => {
    const body = {
      Body: { stkCallback: {
        MerchantRequestID: "29115-34620561-1", CheckoutRequestID: "ws_CO_191220191020363925", ResultCode: 0, ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: { Item: [
          { Name: "Amount", Value: 1.0 }, { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
          { Name: "TransactionDate", Value: 20191219102115 }, { Name: "PhoneNumber", Value: 254708374149 },
        ] },
      } },
    }
    expect(parseStkCallback(body)).toEqual({
      checkoutRequestId: "ws_CO_191220191020363925", resultCode: 0, resultDesc: "The service request is processed successfully.",
      receipt: "NLJ7RT61SV", amount: 1, phone: "254708374149",
    })
  })
  it("reads a cancelled one (no metadata), rejects junk", () => {
    expect(parseStkCallback({ Body: { stkCallback: { CheckoutRequestID: "ws_CO_1", ResultCode: 1032, ResultDesc: "Request cancelled by user" } } }))
      .toMatchObject({ resultCode: 1032, receipt: null, amount: null })
    expect(parseStkCallback({})).toBeNull()
    expect(parseStkCallback({ Body: { stkCallback: { ResultCode: 0 } } })).toBeNull()
  })
})

describe("stkCoversSale", () => {
  const paid = { status: "paid", sale_id: null, amount: 250 }
  it("accepts a paid, unused request that covers the amount", () => {
    expect(stkCoversSale(paid, 250)).toEqual({ ok: true })
    expect(stkCoversSale({ ...paid, amount: 245 }, 244.5)).toEqual({ ok: true }) // push rounds up
  })
  it("refuses unconfirmed, reused or short payments", () => {
    expect(stkCoversSale({ ...paid, status: "pending" }, 250).ok).toBe(false)
    expect(stkCoversSale({ ...paid, sale_id: "s1" }, 250).ok).toBe(false)
    expect(stkCoversSale({ ...paid, amount: 200 }, 250).ok).toBe(false)
  })
})
