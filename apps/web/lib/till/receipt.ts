import type { SalePayload } from "@pharmatrack/core/sync"
import type { Sale, SaleItem } from "@pharmatrack/types"

// A sale recorded on the till (its outbox payload) → the shape ReceiptModal
// prints, so receipts work offline and reprints work from history.

export interface TillReceiptContext {
  branchId: string
  branchName: string
  branchAddress: string | null
  branchPhone: string | null
  orgName: string
  cashierName: string | null
}

export function receiptFromPayload(p: SalePayload, ctx: TillReceiptContext) {
  const subtotal = Math.round(p.items.reduce((s, i) => s + i.line_total, 0) * 100) / 100
  const sale: Sale = {
    id: p.client_id, branch_id: ctx.branchId, cashier_id: p.cashier_id, shift_id: null, receipt_number: p.receipt_number,
    payment_method: p.payment_method, status: "completed", subtotal, discount_amount: p.discount_amount, tax_amount: 0,
    total_amount: p.total_amount, amount_tendered: p.amount_tendered, change_given: p.change_given, mpesa_reference: p.mpesa_reference,
    customer_name: p.customer_name, customer_phone: p.customer_phone, notes: null, voided_at: null, voided_by: null,
    created_at: p.sold_at, org_name: ctx.orgName,
  }
  const items: SaleItem[] = p.items.map((i, n) => ({
    id: `${p.client_id}:${n}`, sale_id: p.client_id, product_id: i.product_id, batch_id: null, product_name: i.product_name,
    product_strength: i.product_strength, base_unit: i.base_unit, quantity: i.quantity, unit_price: i.unit_price,
    discount_percent: i.discount_percent, line_total: i.line_total, created_at: p.sold_at,
  }))
  return {
    sale, items, branchName: ctx.branchName, branchAddress: ctx.branchAddress, branchPhone: ctx.branchPhone,
    cashierName: ctx.cashierName, orgName: ctx.orgName,
  }
}
