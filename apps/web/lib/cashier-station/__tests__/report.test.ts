import { describe, it, expect } from "vitest"
import { stationReport, type StationSaleRow } from "../report"

const base = { receipt_number: "RCP-1", created_at: new Date("2026-11-18T08:00:00Z"), cashier_name: null, branch_name: "Main", offline_reference: null }
const row = (p: Partial<StationSaleRow>): StationSaleRow => ({
  id: crypto.randomUUID(), total_amount: 100, cashier_id: "cate", sold_by_name: null, branch_id: "main", counter_order_id: null, ...base, ...p,
})
const opts = {
  stationBranches: new Map([["main", { direct: false }], ["lenient", { direct: true }]]),
  canCollect: (id: string | null) => id === "cate",
}

describe("cashier station on the sales report", () => {
  it("credits order desks for sales collected through the cashier", () => {
    const r = stationReport([
      row({ counter_order_id: "o1", sold_by_name: "Dan", total_amount: 200 }),
      row({ counter_order_id: "o2", sold_by_name: "Dan", total_amount: 50 }),
      row({ counter_order_id: "o3", sold_by_name: "Eve", total_amount: 300 }),
    ], opts)
    expect(r.bySoldBy).toEqual([{ name: "Eve", revenue: 300, count: 1 }, { name: "Dan", revenue: 250, count: 2 }])
    expect(r.throughCashier).toBe(550)
    expect(r.directCount).toBe(0)
  })

  it("lists sales that skipped the cashier, and how", () => {
    const r = stationReport([
      row({ cashier_id: "dan", cashier_name: "Dan" }),                                     // online, branch strict
      row({ cashier_id: "dan", cashier_name: "Dan", offline_reference: "q1" }),             // queued offline
      row({ cashier_id: "dan", cashier_name: "Dan", branch_id: "lenient" }),                // branch allows it
    ], opts)
    expect(r.direct.map((d) => d.how)).toEqual(["direct", "offline", "allowed"])
    expect(r.directTotal).toBe(300)
  })

  it("ignores the cashier's own sales and branches without the station", () => {
    const r = stationReport([
      row({ cashier_id: "cate" }),                         // the cashier selling directly
      row({ cashier_id: "dan", branch_id: "westlands" }),  // station not on there
    ], opts)
    expect(r.directCount).toBe(0)
  })
})
