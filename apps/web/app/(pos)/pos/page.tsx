"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { ShoppingCart, ChevronUp } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { CartPanel } from "@/components/pos/CartPanel"
import { ProductSearch } from "@/components/pos/ProductSearch"
import { CashModal } from "@/components/pos/CashModal"
import { MpesaModal } from "@/components/pos/MpesaModal"
import { SplitModal } from "@/components/pos/SplitModal"
import { ReceiptModal } from "@/components/pos/ReceiptModal"
import { NewProductDialog } from "@/components/inventory/NewProductDialog"
import { useCartStore, cartTotal, formatKES } from "@/lib/store/cartStore"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { useActiveShift } from "@/lib/hooks/useActiveShift"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
  paperWidth?: "58mm" | "80mm"
}

export default function PosPage() {
  const [payModal, setPayModal] = useState<PayModal>(null)
  const [submitting, setSubmitting] = useState(false)
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null)
  const [newProductOpen, setNewProductOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false) // mobile cart sheet

  const qc = useQueryClient()
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
  // Whether STK push is offered (plan includes it + tenant configured M-Pesa).
  const { data: mpesaAvail } = useQuery<{ available: boolean }>({
    queryKey: ["mpesaAvailable"],
    queryFn: async () => {
      const r = await fetch("/api/mpesa/available")
      return r.ok ? (r.json() as Promise<{ available: boolean }>) : { available: false }
    },
    staleTime: 5 * 60_000,
  })
  const stkAvailable = mpesaAvail?.available ?? false
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

    async function queueThisSaleOffline(reason: "offline" | "network-failure") {
      await queueOfflineSale({
        saleId: crypto.randomUUID(),
        branchId: activeBranch!.id,
        cashierId: profile!.id,
        shiftId: shift?.id ?? null,
        items,
        discount,
        paymentMethod: params.paymentMethod,
        amountTendered: params.amountTendered,
        mpesaReference: params.mpesaReference,
        cashAmount: params.cashAmount ?? null,
        mpesaAmount: params.mpesaAmount ?? null,
        customerPhone: params.customerPhone ?? null,
        createdAt: new Date().toISOString(),
        synced: 0,
      })
      toast.success(
        reason === "offline"
          ? "Saved offline — it will sync when you reconnect. Give the customer a manual receipt."
          : "Connection dropped mid-sale — saved offline, it will sync when you reconnect. Give the customer a manual receipt.",
      )
      clearCart()
      setPayModal(null)
    }

    // Offline: cash + manual M-Pesa + split all queue locally (non-prompting —
    // the customer confirms the M-Pesa payment on their own phone). STK push is
    // the only thing that needs connectivity, so the modals fall back to manual
    // confirm while offline. The M-Pesa code is optional either way.
    if (!online) {
      await queueThisSaleOffline("offline")
      return
    }

    setSubmitting(true)
    try {
      const json = await postJson<{ sale?: Sale; items?: SaleItem[]; paperWidth?: "58mm" | "80mm" }>("/api/sales", {
        branch_id: activeBranch.id,
        shift_id: shift?.id ?? null,
        items,
        discount_amount: discount,
        payment_method: params.paymentMethod,
        amount_tendered: params.amountTendered,
        change_given: params.changeGiven,
        mpesa_reference: params.mpesaReference,
        cash_amount: params.cashAmount ?? null,
        mpesa_amount: params.mpesaAmount ?? null,
        customer_name: null,
        customer_phone: params.customerPhone ?? null,
      })
      if (!json.sale) throw new Error("Sale failed")

      setReceiptData({
        sale: json.sale,
        items: json.items ?? [],
        branchName: activeBranch.name,
        branchAddress: activeBranch.address ?? null,
        orgName: json.sale.org_name ?? "PharmaTrack",
        paperWidth: json.paperWidth ?? "80mm",
      })
      setPayModal(null)
      // Stock changed on the server — refetch the POS product list (and re-warm
      // the offline cache) so on-hand reflects the sale without a manual refresh.
      qc.invalidateQueries({ queryKey: ["productSearch"] })
      qc.invalidateQueries({ queryKey: ["branchCatalogPrefetch"] })
      qc.invalidateQueries({ queryKey: ["topProducts"] })
    } catch (err) {
      // fetch() itself only ever rejects with a TypeError for a genuine network
      // failure (DNS, dropped connection, etc.) — an HTTP error status resolves
      // normally and is surfaced by postJson() as a plain Error instead. So a
      // TypeError here means the request never reached the server at all, even
      // though navigator.onLine said we were connected — don't lose the sale.
      if (err instanceof TypeError) {
        await queueThisSaleOffline("network-failure")
      } else {
        toast.error(err instanceof Error ? err.message : "Sale failed")
      }
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

  // On mobile the cart pay buttons live in a sheet; close it before opening a
  // payment modal so overlays don't stack.
  const handlePay = (method: PayModal) => {
    setCartOpen(false)
    setPayModal(method)
  }
  const itemCount = items.reduce((n, i) => n + i.quantity, 0)

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-[var(--pt-bg)]">
      {/* Cart — desktop only (left). On mobile it's a bottom sheet. */}
      <div className="hidden md:order-1 md:flex md:w-[55%] h-full flex-col min-h-0 md:border-r border-[var(--pt-border)]">
        <CartPanel
          cashierName={profile.full_name}
          onPay={handlePay}
          submitting={submitting}
        />
      </div>

      {/* Product search — fills the screen on mobile, right pane on desktop */}
      <div className="order-1 md:order-2 flex-1 w-full min-h-0 flex flex-col overflow-hidden">
        <ProductSearch
          branchId={activeBranch.id}
          onBarcodeNotFound={handleBarcodeNotFound}
          scannerEnabled={!newProductOpen}
        />
      </div>

      {/* Mobile cart summary bar — tap to open the cart */}
      <button
        onClick={() => setCartOpen(true)}
        className="md:hidden order-2 shrink-0 flex items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[var(--pt-border)] bg-[var(--pt-surface)] active:bg-[var(--pt-muted)] transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <span className="relative">
            <ShoppingCart size={20} className="text-[var(--pt-text-secondary)]" />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-[var(--pt-green)] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {itemCount}
              </span>
            )}
          </span>
          <span className="text-sm font-semibold">
            {itemCount === 0 ? "Cart empty" : `${itemCount} item${itemCount > 1 ? "s" : ""}`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-base font-bold tabular-nums">{formatKES(total)}</span>
          <ChevronUp size={16} className="text-[var(--pt-text-tertiary)]" />
        </span>
      </button>

      {/* Mobile cart sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="md:hidden h-[88vh] p-0 flex flex-col gap-0 rounded-t-2xl"
        >
          <CartPanel
            cashierName={profile.full_name}
            onPay={handlePay}
            submitting={submitting}
            onClose={() => setCartOpen(false)}
          />
        </SheetContent>
      </Sheet>

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
        online={online}
        stkAvailable={stkAvailable}
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
        online={online}
        stkAvailable={stkAvailable}
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
