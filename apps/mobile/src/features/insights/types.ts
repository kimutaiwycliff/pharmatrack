// Response shapes of apps/web/app/api/dashboard/route.ts and
// apps/web/app/api/reports/route.ts (read from those files, not memory). Money
// fields are decimal KES numbers, never cents — display with
// toCents() + <Money>. The Offline Edition's src/repo/reports.ts returns the
// same shapes (minus a few fields marked optional here).

export interface DashboardDay {
  /** Nairobi calendar day, YYYY-MM-DD. */
  date: string
  total: number
  cash: number
  mpesa: number
  transactions: number
}

export interface DashboardResponse {
  kpis: {
    todayRevenue: number
    todayTransactions: number
    todayAvgBasket: number
    /** Percentage 0–100 of today's revenue paid by M-Pesa (or split). */
    mpesaRate: number
  }
  chartData: DashboardDay[]
  topProducts: { product_id: string; name: string; revenue: number; qty: number }[]
  recentTransactions: {
    id: string
    receipt_number: string
    total_amount: number
    payment_method: string
    customer_name: string | null
    created_at: string
  }[]
  alerts: { outOfStock: number; lowStock: number; expiring: number }
}

export type ReportType = "sales" | "inventory" | "financial"

export interface SalesReport {
  // summary.totalSplit is always 0 on the server (split folds into cash and
  // M-Pesa), so it's left out rather than shown as a misleading KPI.
  summary: {
    totalRevenue: number
    totalCash: number
    totalMpesa: number
    totalDiscount: number
    transactionCount: number
    totalCost: number
    totalProfit: number
  }
  dailyChart: { date: string; revenue: number; cash: number; mpesa: number; count: number }[]
  byCashier: { name: string; revenue: number; count: number }[]
  topProducts: { name: string; qty: number; revenue: number; cost: number; profit: number; margin: number | null }[]
  transactions: {
    id: string
    receipt_number: string
    created_at: string
    payment_method: string
    total_amount: number
    discount_amount: number
    cashier: string
    /** Not returned by the Offline Edition's local repo. */
    branch?: string
    item_count: number
  }[]
}

export type InventoryStatus = "out_of_stock" | "low_stock" | "expiring" | "ok"

export interface InventoryReportItem {
  product_id: string
  name: string
  brand_name: string | null
  strength: string | null
  dosage_form: string | null
  stock_on_hand: number | null
  reorder_level: number | null
  base_unit: string | null
  expiry_days: number | null
  is_controlled: boolean | null
  selling_price: number | null
  cost_price: number | null
  status: InventoryStatus
}

export interface InventoryReport {
  summary: { totalSKUs: number; outOfStock: number; lowStock: number; expiring: number; controlled: number }
  items: InventoryReportItem[]
}

export interface FinancialReport {
  summary: { totalRevenue: number; totalDiscounts: number; transactions: number; avgOrderValue: number; totalProfit: number }
  monthlyChart: { month: string; revenue: number; discounts: number; count: number; profit: number }[]
}

export type ReportResult =
  | { kind: "sales"; payload: SalesReport }
  | { kind: "inventory"; payload: InventoryReport }
  | { kind: "financial"; payload: FinancialReport }
  /** 403 { code: "feature_locked" } — the plan doesn't include reports. */
  | { kind: "locked" }
