"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Receipt, X, Printer } from "lucide-react"
import { formatKES } from "@/lib/store/cartStore"
import { ReceiptModal } from "@/components/pos/ReceiptModal"
import type { Sale, SaleItem } from "@pharmatrack/types"

interface SaleDetail extends Sale {
  cashier_name: string
  branch_name: string | null
  branch_address: string | null
}

interface Props {
  saleId: string | null
  onClose: () => void
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Africa/Nairobi",
  })
}

function useSaleDetail(id: string | null) {
  return useQuery<{ sale: SaleDetail; items: SaleItem[]; paperWidth?: "58mm" | "80mm" }>({
    queryKey: ["sale-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/sales/${id}`)
      if (!res.ok) throw new Error("Failed to load sale")
      return res.json() as Promise<{ sale: SaleDetail; items: SaleItem[]; paperWidth?: "58mm" | "80mm" }>
    },
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function SaleDetailSheet({ saleId, onClose }: Props) {
  const { data, isLoading } = useSaleDetail(saleId)
  const [reprintOpen, setReprintOpen] = useState(false)
  const sale = data?.sale
  const items = data?.items ?? []

  return (
    <>
      <Sheet open={!!saleId && !reprintOpen} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full sm:max-w-[480px] p-0 flex flex-col gap-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--pt-border)] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-secondary)]">
                <Receipt size={17} />
              </div>
              <div>
                <h2 className="text-base font-bold">{sale?.receipt_number ?? "Sale"}</h2>
                {sale && (
                  <p className="text-xs text-[var(--pt-text-secondary)]">
                    {fmt(sale.created_at)} · {sale.cashier_name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {sale && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReprintOpen(true)}
                  className="gap-1.5 text-xs h-8"
                >
                  <Printer size={13} />
                  Reprint
                </Button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 bg-[var(--pt-muted-strong)] rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {sale && (
              <>
                {/* Items */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">Items</p>
                  <div className="bg-[var(--pt-muted)] rounded-xl px-4 py-3 space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-[var(--pt-text-secondary)]">
                          {item.product_name} × {item.quantity} {item.base_unit}
                        </span>
                        <span className="font-semibold tabular-nums">{formatKES(item.line_total)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">Totals</p>
                  <div className="bg-[var(--pt-muted)] rounded-xl px-4 py-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--pt-text-secondary)]">Subtotal</span>
                      <span className="font-semibold tabular-nums">{formatKES(sale.subtotal)}</span>
                    </div>
                    {sale.discount_amount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--pt-text-secondary)]">Discount</span>
                        <span className="font-semibold tabular-nums">- {formatKES(sale.discount_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--pt-text-secondary)] font-bold">Total</span>
                      <span className="font-bold tabular-nums">{formatKES(sale.total_amount)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">Payment</p>
                  <div className="bg-[var(--pt-muted)] rounded-xl px-4 py-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--pt-text-secondary)]">Method</span>
                      <span className="font-semibold capitalize">{sale.payment_method}</span>
                    </div>
                    {sale.mpesa_reference && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--pt-text-secondary)]">M-Pesa Ref</span>
                        <span className="font-semibold tracking-wide">{sale.mpesa_reference}</span>
                      </div>
                    )}
                    {sale.amount_tendered != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--pt-text-secondary)]">Tendered</span>
                        <span className="font-semibold tabular-nums">{formatKES(sale.amount_tendered)}</span>
                      </div>
                    )}
                    {sale.change_given != null && sale.change_given > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--pt-text-secondary)]">Change</span>
                        <span className="font-semibold tabular-nums">{formatKES(sale.change_given)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {sale && (
        <ReceiptModal
          open={reprintOpen}
          data={{
            sale,
            items,
            branchName: sale.branch_name ?? "",
            branchAddress: sale.branch_address,
            orgName: sale.org_name ?? "PharmaTrack",
            paperWidth: data?.paperWidth ?? "80mm",
          }}
          onNewSale={() => setReprintOpen(false)}
          closeLabel="Close"
        />
      )}
    </>
  )
}
