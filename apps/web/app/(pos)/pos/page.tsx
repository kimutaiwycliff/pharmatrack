"use client"

import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { ShoppingCart, ChevronUp } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { CartPanel } from "@/components/pos/CartPanel"
import { ProductSearch } from "@/components/pos/ProductSearch"
import { CashModal } from "@/components/pos/CashModal"
import { MpesaModal } from "@/components/pos/MpesaModal"
import { SplitModal } from "@/components/pos/SplitModal"
import { ReceiptModal } from "@/components/pos/ReceiptModal"
import { FirstSaleCelebration, PosCoach } from "@/components/onboarding/PosCoach"
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
import { useSuppliers } from "@/lib/hooks/useSuppliers"
import { useReceiptProfile } from "@/lib/printing/useReceiptProfile"
import type { PaymentInput } from "@pharmatrack/core/sync"
import { useTillActive, useTillStore, bumpTillData } from "@/lib/till/store"
import { AllowanceError, cartToLines, commitTillSale, TillLockedError, type CommitSaleInput } from "@/lib/till/commit-sale"
import { refreshTillState, requestTopUp, scheduleSoonSync } from "@/lib/till/engine"
import { NetworkError } from "@/lib/till/http"
import { receiptFromPayload } from "@/lib/till/receipt"

type PayModal = "cash" | "mpesa" | "split" | null

interface ReceiptData {
  sale: Sale
  items: SaleItem[]
  branchName: string
  branchAddress: string | null
  branchPhone?: string | null
  cashierName?: string | null
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
  // Warm the receipt branding now so the receipt never waits on it.
  useReceiptProfile()
  const branches = useSessionStore((s) => s.branches)
  const activeBranchId = useUIStore((s) => s.activeBranchId)

  const online = useOnline()
  const tillActive = useTillActive()
  const tillDevice = useTillStore((s) => s.device)
  const tillBranchInfo = useTillStore((s) => s.branch)
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
  // A registered till keeps its shift on this computer (lib/till); only a plain browser uses the server shift.
  const { data: shift } = useActiveShift(tillActive ? null : (profile?.id ?? ""))
  // Sell from the branch the open shift belongs to — that's where the cash
  // drawer is. Before a shift loads, fall back to the selected branch, else the
  // first valid branch, so a sale never POSTs an empty branch_id.
  const activeBranch =
    (tillActive ? branches.find((b) => b.id === tillDevice?.branchId) : undefined) ??
    branches.find((b) => b.id === shift?.branch_id && isUuid(b.id)) ??
    branches.find((b) => b.id === activeBranchId && isUuid(b.id)) ??
    branches.find((b) => isUuid(b.id)) ??
    null
  const items = useCartStore((s) => s.items)
  const discount = useCartStore((s) => s.discount)
  const clearCart = useCartStore((s) => s.clearCart)
  const total = cartTotal(items, discount)

  // Suppliers for NewProductDialog (categories are fetched by CategoryPicker)
  const { data: supData } = useSuppliers({ enabled: !!activeBranch })

  const suppliers = supData ?? []

  async function submitSale(params: {
    paymentMethod: "cash" | "mpesa" | "split"
    amountTendered: number | null
    changeGiven: number | null
    mpesaReference: string | null
    cashAmount?: number
    mpesaAmount?: number
    customerPhone?: string | null
    /** M-Pesa confirmed after an STK prompt (vs. a code typed by hand). */
    mpesaViaPrompt?: boolean
  }) {
    if (!profile) return
    if (tillActive) {
      await submitTillSale(params)
      return
    }
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
        branchPhone: activeBranch.phone ?? null,
        cashierName: profile?.full_name ?? null,
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

  // Registered till: every sale (online or not) is recorded on this computer
  // first and uploads a few seconds later — same rules as the Android app.
  async function submitTillSale(params: {
    paymentMethod: "cash" | "mpesa" | "split"
    amountTendered: number | null
    mpesaReference: string | null
    cashAmount?: number
    mpesaAmount?: number
    customerPhone?: string | null
    mpesaViaPrompt?: boolean
  }) {
    const till = useTillStore.getState()
    if (!till.staff || !till.shift) {
      toast.error("Start a shift before selling.")
      return
    }
    if (items.length === 0) {
      toast.error("Cart is empty.")
      return
    }
    const cents = (kes: number | null | undefined) => Math.round((kes ?? 0) * 100)
    const verified = !!params.mpesaViaPrompt
    const payment: PaymentInput =
      params.paymentMethod === "cash"
        ? { method: "cash", tenderedCents: cents(params.amountTendered) }
        : params.paymentMethod === "mpesa"
          ? { method: "mpesa", reference: params.mpesaReference, verified }
          : { method: "split", cashCents: cents(params.cashAmount), mpesaCents: cents(params.mpesaAmount), reference: params.mpesaReference, verified }
    const input: CommitSaleInput = {
      cashierId: till.staff.id, shiftClientId: till.shift.client_id, lines: cartToLines(items), payment,
      discountCents: cents(discount), customerPhone: params.customerPhone ?? null,
    }

    setSubmitting(true)
    try {
      let result: Awaited<ReturnType<typeof commitTillSale>> | null = null
      // Online, a line beyond this computer's share asks the server for more
      // (from stock no other till holds) and tries again — once per product.
      for (let attempt = 0; attempt <= input.lines.length; attempt++) {
        try {
          result = await commitTillSale(input)
          break
        } catch (err) {
          if (!(err instanceof AllowanceError)) throw err
          const short = err.wanted - err.available
          let granted = 0
          if (navigator.onLine) {
            try {
              granted = await requestTopUp(err.productId, short)
            } catch (e) {
              if (!(e instanceof NetworkError)) throw e
            }
          }
          if (granted < short) {
            const have = err.available + granted
            toast.error(
              navigator.onLine
                ? (have > 0
                  ? `Only ${have} ${err.productName} can be sold here — other tills hold the rest of the branch's stock. Reduce the quantity, or sync the other tills (remove unused ones in Settings → Devices).`
                  : `No ${err.productName} free for this till — other tills hold what's left. Sync them, or remove unused ones in Settings → Devices.`)
                : (have > 0
                  ? `Only ${have} ${err.productName} left on this computer while offline. Reduce the quantity.`
                  : `No ${err.productName} left on this computer while offline. Remove it from the cart.`),
              { duration: 8000 },
            )
            return
          }
        }
      }
      if (!result) throw new Error("Sale was not recorded")

      const b = activeBranch
      setReceiptData({
        ...receiptFromPayload(result.payload, {
          branchId: tillDevice?.branchId ?? b?.id ?? "",
          branchName: tillBranchInfo?.name ?? b?.name ?? "Branch",
          branchAddress: tillBranchInfo?.address ?? b?.address ?? null,
          branchPhone: tillBranchInfo?.phone ?? b?.phone ?? null,
          orgName: tillDevice?.organizationName ?? "PharmaTrack",
          cashierName: till.staff.name,
        }),
      })
      setPayModal(null)
      bumpTillData()
      void refreshTillState() // header: "N waiting to upload"
      scheduleSoonSync()
      if (!navigator.onLine) {
        toast.success(`Saved on this computer · ${result.receiptNumber}. It uploads when the internet is back.`, { id: "till-saved-offline" })
      }
    } catch (err) {
      toast.error(err instanceof TillLockedError || err instanceof Error ? err.message : "The sale wasn't recorded. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewSale = useCallback(() => {
    clearCart()
    setReceiptData(null)
    // Ready for the next customer: scanner/keyboard go straight to search.
    window.setTimeout(() => document.getElementById("pos-search")?.focus(), 50)
  }, [clearCart])

  // Keyboard-first selling (desktop tills): F2 search · F8 cash · F9 M-Pesa ·
  // F4 split. Keys that browsers keep (F5 reload, F6 address bar, F7 caret
  // browsing…) are left alone. Ignored while a payment, receipt or new-product
  // dialog is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (payModal || receiptData || newProductOpen) return
      const pay = e.key === "F8" ? "cash" : e.key === "F9" ? "mpesa" : e.key === "F4" ? "split" : null
      if (e.key === "F2") {
        e.preventDefault()
        const el = document.getElementById("pos-search") as HTMLInputElement | null
        el?.focus()
        el?.select()
        return
      }
      if (!pay) return
      e.preventDefault()
      if (items.length === 0) {
        toast.info("Add something to the cart first.", { id: "pos-empty-cart" })
        return
      }
      if (submitting) return
      setCartOpen(false)
      setPayModal(pay)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [payModal, receiptData, newProductOpen, items.length, submitting])

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
      {/* Remounted on each open so "tendered" starts from this sale's total. */}
      <CashModal
        key={payModal === "cash" ? "cash-open" : "cash-closed"}
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
        onConfirm={(ref, how) =>
          submitSale({
            paymentMethod: "mpesa",
            amountTendered: total,
            changeGiven: 0,
            mpesaReference: ref,
            mpesaViaPrompt: how.viaPrompt,
          })
        }
      />
      <SplitModal
        open={payModal === "split"}
        total={total}
        online={online}
        stkAvailable={stkAvailable}
        onClose={() => setPayModal(null)}
        onConfirm={(cashAmt, mpesaAmt, ref, how) =>
          submitSale({
            paymentMethod: "split",
            amountTendered: cashAmt,
            changeGiven: 0,
            mpesaReference: ref,
            cashAmount: cashAmt,
            mpesaAmount: mpesaAmt,
            mpesaViaPrompt: how.viaPrompt,
          })
        }
      />

      {/* First sale coaching + celebration (ADR-019) */}
      <PosCoach cartCount={items.length} paused={payModal !== null || receiptData !== null || newProductOpen} />
      <FirstSaleCelebration receiptOpen={receiptData !== null} />

      {/* Receipt */}
      <ReceiptModal
        open={receiptData !== null}
        data={receiptData}
        onNewSale={handleNewSale}
        autoPrint
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
