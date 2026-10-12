import { toCSV } from "@pharmatrack/core"
import type { FinancialReport, InventoryReportItem, SalesReport } from "../types"
import { inventoryStatusLabel } from "./kpis"

// CSV for every report table (CLAUDE.md §6.8 "CSV export on every report
// table"), built from what's already on screen — no extra API call. Amounts
// stay decimal KES exactly as the API sent them. Cost / profit columns are
// only included for people with cost.view. Pure (no RN).

export interface CsvFile {
  filename: string
  csv: string
}

function name(kind: string, range: { from: string; to: string } | null): string {
  return range ? `pharmatrack-${kind}-${range.from}-to-${range.to}.csv` : `pharmatrack-${kind}.csv`
}

export function transactionsCsv(rows: SalesReport["transactions"], range: { from: string; to: string }): CsvFile {
  return {
    filename: name("transactions", range),
    csv: toCSV(
      ["Receipt", "Date", "Cashier", "Branch", "Payment method", "Items", "Discount (KES)", "Total (KES)"],
      rows.map((t) => [t.receipt_number, t.created_at, t.cashier, t.branch ?? "", t.payment_method, t.item_count, t.discount_amount, t.total_amount]),
    ),
  }
}

export function topProductsCsv(rows: SalesReport["topProducts"], range: { from: string; to: string }, withCost: boolean): CsvFile {
  const headers = withCost
    ? ["Product", "Quantity", "Revenue (KES)", "Cost (KES)", "Profit (KES)", "Margin (%)"]
    : ["Product", "Quantity", "Revenue (KES)"]
  return {
    filename: name("top-products", range),
    csv: toCSV(
      headers,
      rows.map((p) =>
        withCost
          ? [p.name, p.qty, p.revenue, p.cost, p.profit, p.margin == null ? "" : Number((p.margin * 100).toFixed(1))]
          : [p.name, p.qty, p.revenue],
      ),
    ),
  }
}

export function cashiersCsv(rows: SalesReport["byCashier"], range: { from: string; to: string }): CsvFile {
  return {
    filename: name("sales-by-cashier", range),
    csv: toCSV(["Cashier", "Sales", "Revenue (KES)"], rows.map((c) => [c.name, c.count, c.revenue])),
  }
}

export function inventoryCsv(rows: readonly InventoryReportItem[], withCost: boolean): CsvFile {
  const headers = ["Product", "Brand", "Strength", "Form", "Stock on hand", "Reorder level", "Days to expiry", "Status", "Controlled", "Selling price (KES)"]
  return {
    filename: name("inventory", null),
    csv: toCSV(
      withCost ? [...headers, "Cost price (KES)"] : headers,
      rows.map((i) => {
        const row: (string | number)[] = [
          i.name,
          i.brand_name ?? "",
          i.strength ?? "",
          i.dosage_form ?? "",
          i.stock_on_hand ?? 0,
          i.reorder_level ?? 0,
          i.expiry_days ?? "",
          inventoryStatusLabel(i.status),
          i.is_controlled ? "Yes" : "No",
          i.selling_price ?? "",
        ]
        return withCost ? [...row, i.cost_price ?? ""] : row
      }),
    ),
  }
}

export function monthlyCsv(rows: FinancialReport["monthlyChart"], range: { from: string; to: string }, withProfit: boolean): CsvFile {
  const headers = withProfit
    ? ["Month", "Transactions", "Revenue (KES)", "Discounts (KES)", "Gross profit (KES)", "Net revenue (KES)"]
    : ["Month", "Transactions", "Revenue (KES)", "Discounts (KES)", "Net revenue (KES)"]
  return {
    filename: name("financial", range),
    csv: toCSV(
      headers,
      rows.map((m) => {
        // Net revenue in cents so 0.1 + 0.2-style drift never reaches the file.
        const net = (Math.round(m.revenue * 100) - Math.round(m.discounts * 100)) / 100
        return withProfit ? [m.month, m.count, m.revenue, m.discounts, m.profit, net] : [m.month, m.count, m.revenue, m.discounts, net]
      }),
    ),
  }
}
