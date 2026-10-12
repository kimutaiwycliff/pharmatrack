import { describe, expect, it } from "vitest"
import { issueKind, issueMeta, type SyncIssue } from "../kinds"

function issue(kind: string, details: Record<string, unknown>, extra: Partial<SyncIssue> = {}): SyncIssue {
  return {
    id: "i1",
    kind,
    status: "open",
    details,
    created_at: "2026-03-12T05:00:00Z",
    sale_id: null,
    shift_id: null,
    product_id: null,
    resolved_at: null,
    resolution_note: null,
    device_name: null,
    device_code: null,
    receipt: null,
    product_name: null,
    branch_name: null,
    ...extra,
  }
}

describe("issueKind — same wording as the web inbox", () => {
  it("oversell", () => {
    const k = issueKind("oversell")
    expect(k.label).toBe("Sold more than the shelf")
    expect(k.describe(issue("oversell", { product_name: "Panadol", sold: 5, unbacked: 2 }))).toBe("Panadol: 2 of 5 sold with no stock left")
  })
  it("price_mismatch uses KES decimals from details", () => {
    const text = issueKind("price_mismatch").describe(
      issue("price_mismatch", { product_name: "Amoxil", charged_unit_price: 10, current_unit_price: 12.5, quantity: 3 }),
    )
    expect(text).toBe("Amoxil: charged KES 10.00 vs current KES 12.50 × 3")
  })
  it("mpesa_unverified with and without a code", () => {
    const k = issueKind("mpesa_unverified")
    expect(k.describe(issue("mpesa_unverified", { amount: 250, reference: "QWE123" }))).toBe("KES 250.00 · code QWE123")
    expect(k.describe(issue("mpesa_unverified", { amount: 250, reference: null }))).toBe("KES 250.00 · no code entered")
  })
  it("late_sync shows the sale time in Nairobi", () => {
    const text = issueKind("late_sync").describe(issue("late_sync", { sold_at: "2026-03-12T20:30:00Z", override_client_id: "x" }))
    expect(text).toBe("Sold 12 Mar 2026, 23:30 · under a manager override")
  })
  it("override_used flags managers without the permission", () => {
    expect(issueKind("override_used").describe(issue("override_used", { pending_sales: 4, manager_permitted: false }))).toBe(
      "4 sales were waiting · this person isn't allowed to override",
    )
  })
  it("rejected_sale joins receipt, amount and reason", () => {
    const text = issueKind("rejected_sale").describe(
      issue("rejected_sale", { code: "cashier_invalid", message: "This staff member can't sell at this branch", payload: { receipt_number: "R-1", total_amount: 99.5 } }),
    )
    expect(text).toBe("R-1 KES 99.50 — This staff member can't sell at this branch")
  })
  it("falls back to the raw kind for unknown issues", () => {
    expect(issueKind("something_new").label).toBe("something_new")
  })
})

describe("issueMeta", () => {
  it("joins device, receipt, branch and time", () => {
    const i = issue("late_sync", {}, { device_name: "Till 1", device_code: "AB12", receipt: "R-9", branch_name: "Westlands" })
    expect(issueMeta(i, { showBranch: true })).toBe("Till 1 (AB12) · receipt R-9 · Westlands · 12 Mar 2026, 08:00")
    expect(issueMeta(i, { showBranch: false })).toBe("Till 1 (AB12) · receipt R-9 · 12 Mar 2026, 08:00")
  })
})
