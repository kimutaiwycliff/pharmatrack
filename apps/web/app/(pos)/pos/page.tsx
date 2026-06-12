"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { CartPanel } from "@/components/pos/CartPanel"
import { ProductSearch } from "@/components/pos/ProductSearch"
import { CashModal } from "@/components/pos/CashModal"
import { MpesaModal } from "@/components/pos/MpesaModal"
import { SplitModal } from "@/components/pos/SplitModal"
import { ReceiptModal } from "@/components/pos/ReceiptModal"
import { NewProductDialog } from "@/components/inventory/NewProductDialog"
import { useCartStore, cartTotal } from "@/lib/store/cartStore"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { useActiveShift } from "@/lib/hooks/useActiveShift"
import { useQuery } from "@tanstack/react-query"
import { useOnline } from "@/lib/offline/useOnline"
import { queueOfflineSale } from "@/lib/offline/db"
import { postJson } from "@/lib/api/fetcher"
import { isUuid } from "@/lib/utils"
import type { Sale, SaleItem } from "@pharmatrack/types"

type PayModal = "cash" | "mpesa" | "split" | null

interface ReceiptData {
  sale: Sale
  items: SaleItem[]
  branchName: string
  branchAddress: string | null
  orgName: string
}

export default function PosPage() {
  const [payModal, setPayModal] = useState<PayModal>(null)
  const [submitting, setSubmitting] = useState(false)
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null)
  const [newProductOpen, setNewProductOpen] = useState(false)

  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  // Resolve to a branch with a valid UUID id: the selected one, else the first
  // valid branch. Guards against a stale/empty persisted activeBranchId so the
  // sale never POSTs an empty branch_id.
  const activeBranch =
    branches.find((b) => b.id === activeBranchId && isUuid(b.id)) ??
    branches.find((b) => isUuid(b.id)) ??
    null

  const online = useOnline()
  const { data: shift } = useActiveShift(profile?.id ?? "")
  const items = useCartStore((s) => s.items)
  const discount = useCartStore((s) => s.discount)
  const clearCart = useCartStore((s) => s.clearCart)
  const total = cartTotal(items, discount)

  // Suppliers for NewProductDialog (categories are fetched by CategorySelect)
  const { data: supData } = useQuery<{ suppliers: Array<{ id: string; name: string }> }>({
    queryKey: ["suppliers", activeBranch?.id],
    queryFn: async () => {
      if (!activeBranch) return { suppliers: [] }
      const res = await fetch(`/api/suppliers`)
      if (!res.ok) return { suppliers: [] }
      return res.json() as Promise<{ suppliers: Array<{ id: string; name: string }> }>
    },
    enabled: !!activeBranch,
    staleTime: 300_000,
  })

  const suppliers = supData?.suppliers ?? []

  async function submitSale(params: {
    paymentMethod: "cash" | "mpesa" | "split"
    amountTendered: number | null
    changeGiven: number | null
    mpesaReference: string | null
    cashAmount?: number
    mpesaAmount?: number
    customerPhone?: string | null
  }) {
    if (!profile) return
    if (!activeBranch || !isUuid(activeBranch.id)) {
      toast.error("No valid branch selected — pick a branch from the selector and try again.")
      return
    }
    if (items.length === 0) {
      toast.error("Cart is empty.")
      return
    }
    const badItem = items.find((i) => !isUuid(i.product_id))
    if (badItem) {
      toast.error(`"${badItem.product_name}" is missing a valid product id — remove and re-add it.`)
      return
    }

    // Offline: only cash can be recorded (M-Pesa/card need connectivity).
    if (!online) {
      if (params.paymentMethod !== "cash") {
        toast.error("You're offline — only cash sales can be recorded until you reconnect")
        return
      }
      await queueOfflineSale({
        saleId: crypto.randomUUID(),
        branchId: activeBranch.id,
        cashierId: profile.id,
        shiftId: shift?.id ?? null,
        items,
        discount,
        paymentMethod: "cash",
        amountTendered: params.amountTendered,
        mpesaReference: null,
        cashAmount: null,
        mpesaAmount: null,
        customerPhone: params.customerPhone ?? null,
        createdAt: new Date().toISOString(),
        synced: false,
      })
      toast.success("Saved offline — it will sync when you reconnect. Give the customer a manual receipt.")
      clearCart()
      setPayModal(null)
      return
    }

    setSubmitting(true)
    try {
      const json = await postJson<{ sale?: Sale; items?: SaleItem[] }>("/api/sales", {
        branch_id: activeBranch.id,
        shift_id: shift?.id ?? null,
        items,
        discount_amount: discount,
        payment_method: params.paymentMethod,
        amount_tendered: params.amountTendered,
        change_given: params.changeGiven,
        mpesa_reference: params.mpesaReference,
        customer_name: null,
        customer_phone: params.customerPhone ?? null,
      })
      if (!json.sale) throw new Error("Sale failed")

      setReceiptData({
        sale: json.sale,
        items: json.items ?? [],
        branchName: activeBranch.name,
        branchAddress: activeBranch.address ?? null,
        orgName: "PharmaTrack",
      })
      setPayModal(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sale failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewSale = useCallback(() => {
    clearCart()
    setReceiptData(null)
  }, [clearCart])

  const handleBarcodeNotFound = useCallback((barcode: string) => {
    setNotFoundBarcode(barcode)
    setNewProductOpen(true)
  }, [])

  if (!activeBranch || !profile) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--pt-text-secondary)] text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-[var(--pt-bg)]">
      {/* Cart — below on mobile, left on desktop */}
      <div className="order-2 md:order-1 w-full md:w-[55%] h-2/5 md:h-full flex flex-col min-h-0 border-t md:border-t-0 md:border-r border-[var(--pt-border)]">
        <CartPanel
          cashierName={profile.full_name}
          onPay={setPayModal}
          submitting={submitting}
        />
      </div>

      {/* Product search — on top on mobile, right on desktop */}
      <div className="order-1 md:order-2 flex-1 w-full h-3/5 md:h-full flex flex-col min-h-0 overflow-hidden">
        <ProductSearch
          branchId={activeBranch.id}
          onBarcodeNotFound={handleBarcodeNotFound}
          scannerEnabled={!newProductOpen}
        />
      </div>

      {/* Payment modals */}
      <CashModal
        open={payModal === "cash"}
        total={total}
        onClose={() => setPayModal(null)}
        onConfirm={(tendered, change) =>
          submitSale({
            paymentMethod: "cash",
            amountTendered: tendered,
            changeGiven: change,
            mpesaReference: null,
          })
        }
      />
      <MpesaModal
        open={payModal === "mpesa"}
        total={total}
        onClose={() => setPayModal(null)}
        onConfirm={(ref) =>
          submitSale({
            paymentMethod: "mpesa",
            amountTendered: total,
            changeGiven: 0,
            mpesaReference: ref,
          })
        }
      />
      <SplitModal
        open={payModal === "split"}
        total={total}
        onClose={() => setPayModal(null)}
        onConfirm={(cashAmt, mpesaAmt, ref) =>
          submitSale({
            paymentMethod: "split",
            amountTendered: cashAmt,
            changeGiven: 0,
            mpesaReference: ref,
            cashAmount: cashAmt,
            mpesaAmount: mpesaAmt,
          })
        }
      />

      {/* Receipt */}
      <ReceiptModal
        open={receiptData !== null}
        data={receiptData}
        onNewSale={handleNewSale}
      />

      {/* New product registration (triggered when barcode not found) */}
      <NewProductDialog
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        prefill={notFoundBarcode ? { gtin: notFoundBarcode } : undefined}
        branchId={activeBranch.id}
        suppliers={suppliers}
        onCreated={() => {
          setNewProductOpen(false)
          setNotFoundBarcode(null)
        }}
      />
    </div>
  )
}
