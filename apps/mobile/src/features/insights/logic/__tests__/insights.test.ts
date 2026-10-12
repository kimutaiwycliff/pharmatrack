import { describe, expect, it } from "vitest"
import { barPercents, MIN_VISIBLE_PERCENT } from "../bars"
import { cashiersCsv, inventoryCsv, monthlyCsv, topProductsCsv, transactionsCsv } from "../csv"
import { expiryNote, fillDailySeries, filterInventory, marginLabel, paymentLabel, paymentSplit, percentLabel, toCents } from "../kpis"
import { monthLabel, shortDayLabel } from "../labels"
import { addDays, lastNDays, nairobiBounds, presetRange, validateRange } from "../ranges"

// 2026-03-11 22:30 UTC is already 12 Mar in Nairobi (UTC+3).
const LATE_NIGHT = new Date("2026-03-11T22:30:00Z")

describe("barPercents", () => {
  it("scales the tallest bar to 100%", () => {
    expect(barPercents([50, 100, 25])).toEqual([50, 100, 25])
    expect(barPercents([3, 3])).toEqual([100, 100])
  })
  it("gives zero, negative and junk values no bar, and empty series nothing", () => {
    expect(barPercents([0, -5, Number.NaN, 10])).toEqual([0, 0, 0, 100])
    expect(barPercents([0, 0])).toEqual([0, 0])
    expect(barPercents([])).toEqual([])
  })
  it("keeps tiny non-zero values visible", () => {
    expect(barPercents([1, 10_000])[0]).toBe(MIN_VISIBLE_PERCENT)
  })
})

describe("date ranges", () => {
  it("does calendar arithmetic across month and year ends", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01")
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29")
  })
  it("builds presets ending on Nairobi's today, not UTC's", () => {
    expect(presetRange("today", LATE_NIGHT)).toEqual({ from: "2026-03-12", to: "2026-03-12" })
    expect(presetRange("7d", LATE_NIGHT)).toEqual({ from: "2026-03-06", to: "2026-03-12" })
    expect(presetRange("30d", LATE_NIGHT)).toEqual({ from: "2026-02-11", to: "2026-03-12" })
    expect(presetRange("month", LATE_NIGHT)).toEqual({ from: "2026-03-01", to: "2026-03-12" })
  })
  it("lists the last n days oldest first", () => {
    expect(lastNDays(3, LATE_NIGHT)).toEqual(["2026-03-10", "2026-03-11", "2026-03-12"])
  })
  it("rejects a backwards custom range", () => {
    expect(validateRange({ from: "2026-03-01", to: "2026-03-12" })).toBeNull()
    expect(validateRange({ from: "2026-03-12", to: "2026-03-12" })).toBeNull()
    expect(validateRange({ from: "2026-03-13", to: "2026-03-12" })).toMatch(/start date/)
    expect(validateRange({ from: "", to: "2026-03-12" })).toMatch(/both dates/)
  })
  it("gives whole Nairobi days for the local repo", () => {
    const b = nairobiBounds({ from: "2026-03-01", to: "2026-03-12" })
    expect(new Date(b.fromIso).toISOString()).toBe("2026-02-28T21:00:00.000Z")
    expect(new Date(b.toIso).toISOString()).toBe("2026-03-12T20:59:59.999Z")
  })
})

describe("KPI helpers", () => {
  it("converts decimal KES to integer cents without float drift", () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents("1234.56")).toBe(123_456)
    expect(toCents(null)).toBe(0)
    expect(toCents("abc")).toBe(0)
  })
  it("splits a day's takings and puts the remainder under other", () => {
    expect(paymentSplit({ total: 1000.5, cash: 400.25, mpesa: 500 })).toEqual({
      totalCents: 100_050,
      cashCents: 40_025,
      mpesaCents: 50_000,
      otherCents: 10_025,
    })
    expect(paymentSplit(undefined).totalCents).toBe(0)
    // Never negative even if the parts overshoot.
    expect(paymentSplit({ total: 10, cash: 6, mpesa: 6 }).otherCents).toBe(0)
  })
  it("labels margins and percentages", () => {
    expect(marginLabel(25, 100)).toBe("25.0% margin")
    expect(marginLabel(5, 0)).toBeNull()
    expect(percentLabel(61.6)).toBe("62%")
    expect(percentLabel(140)).toBe("100%")
    expect(percentLabel(Number.NaN)).toBe("0%")
  })
  it("fills missing days so the chart shows the full week", () => {
    const filled = fillDailySeries([{ date: "2026-03-11", v: 5 }], ["2026-03-10", "2026-03-11"], (date) => ({ date, v: 0 }))
    expect(filled).toEqual([
      { date: "2026-03-10", v: 0 },
      { date: "2026-03-11", v: 5 },
    ])
  })
  it("filters inventory like the web report", () => {
    const items = [
      { status: "ok" as const, is_controlled: true },
      { status: "low_stock" as const, is_controlled: false },
      { status: "out_of_stock" as const, is_controlled: null },
    ]
    expect(filterInventory(items, "all")).toHaveLength(3)
    expect(filterInventory(items, "controlled")).toEqual([items[0]])
    expect(filterInventory(items, "low_stock")).toEqual([items[1]])
  })
  it("describes expiry and payment methods", () => {
    expect(expiryNote(null)).toBeNull()
    expect(expiryNote(120)).toBeNull()
    expect(expiryNote(-2)).toBe("Expired")
    expect(expiryNote(0)).toBe("Expires today")
    expect(expiryNote(1)).toBe("Expires in 1 day")
    expect(expiryNote(30)).toBe("Expires in 30 days")
    expect(paymentLabel("mpesa")).toBe("M-Pesa")
    expect(paymentLabel("voucher")).toBe("voucher")
  })
})

describe("labels", () => {
  it("formats bare days and months without a UTC shift", () => {
    expect(shortDayLabel("2026-03-12")).toMatch(/12/)
    expect(shortDayLabel("2026-03-12")).toMatch(/Mar/)
    expect(monthLabel("2026-03")).toMatch(/Mar/)
    expect(monthLabel("2026-03")).toMatch(/2026/)
  })
})

describe("CSV builders", () => {
  const range = { from: "2026-03-01", to: "2026-03-12" }
  it("exports transactions with the range in the file name", () => {
    const f = transactionsCsv(
      [{ id: "s1", receipt_number: "R-1", created_at: "2026-03-12T08:00:00Z", payment_method: "cash", total_amount: 100, discount_amount: 0, cashier: "Jane, Doe", item_count: 2 }],
      range,
    )
    expect(f.filename).toBe("pharmatrack-transactions-2026-03-01-to-2026-03-12.csv")
    const [header, row] = f.csv.split("\n")
    expect(header.startsWith("Receipt,Date,Cashier,Branch")).toBe(true)
    // Commas are quoted; a missing branch (local repo) is an empty cell.
    expect(row).toBe('R-1,2026-03-12T08:00:00Z,"Jane, Doe",,cash,2,0,100')
  })
  it("drops cost and profit columns without cost.view", () => {
    const rows = [{ name: "Amoxil", qty: 3, revenue: 300, cost: 200, profit: 100, margin: 1 / 3 }]
    expect(topProductsCsv(rows, range, true).csv.split("\n")[1]).toBe("Amoxil,3,300,200,100,33.3")
    expect(topProductsCsv(rows, range, false).csv.split("\n")).toEqual(["Product,Quantity,Revenue (KES)", "Amoxil,3,300"])
    const months = [{ month: "2026-03", revenue: 0.3, discounts: 0.1, count: 1, profit: 0.05 }]
    expect(monthlyCsv(months, range, true).csv.split("\n")[1]).toBe("2026-03,1,0.3,0.1,0.05,0.2")
    expect(monthlyCsv(months, range, false).csv.split("\n")[0]).not.toMatch(/profit/i)
  })
  it("exports cashiers and inventory", () => {
    expect(cashiersCsv([{ name: "Jane", revenue: 50, count: 2 }], range).csv.split("\n")[1]).toBe("Jane,2,50")
    const inv = inventoryCsv(
      [
        {
          product_id: "p1", name: "Paracetamol", brand_name: null, strength: "500mg", dosage_form: "tablet", stock_on_hand: 0, reorder_level: 10,
          base_unit: "tablet", expiry_days: null, is_controlled: false, selling_price: 5, cost_price: 2, status: "out_of_stock",
        },
      ],
      false,
    )
    expect(inv.filename).toBe("pharmatrack-inventory.csv")
    expect(inv.csv.split("\n")[1]).toBe("Paracetamol,,500mg,tablet,0,10,,Out of stock,No,5")
  })
})
