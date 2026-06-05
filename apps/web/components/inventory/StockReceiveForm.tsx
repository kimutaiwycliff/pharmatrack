"use client"

import { useState, useCallback } from "react"
import { ScanLine, Trash2, CheckCircle2, Info, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useBarcodeScanner } from "@/lib/barcode/useBarcodeScanner"
import { useProductLookup } from "@/lib/hooks/useProductLookup"
import { formatKES } from "@/lib/store/cartStore"
import type { ProductWithStock } from "@pharmatrack/types"

interface ReceiveItem {
  productId: string
  productName: string
  gtin: string | null
  batchNumber: string
  expiryDate: string
  qty: number
  unitsPerPack: number
  packLabel: string | null
  costPrice: number | null
  supplierId: string | null
}

interface Props {
  branchId: string
  suppliers: Array<{ id: string; name: string }>
  onPosted: () => void
}

function ReceiveItemCard({ item, index, onRemove }: { item: ReceiveItem; index: number; onRemove: () => void }) {
  const totalUnits = item.qty * item.unitsPerPack
  const totalCost = item.costPrice != null ? item.costPrice * item.qty : null
  return (
    <div className="flex gap-3 py-4 border-b border-[var(--pt-border)] last:border-b-0">
      <span className="w-6 h-6 rounded-full bg-[var(--pt-muted-strong)] flex items-center justify-center text-[10px] font-bold text-[var(--pt-text-secondary)] shrink-0 mt-0.5">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{item.productName}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-[var(--pt-text-secondary)]">
          <span>
            <strong className="text-[var(--pt-text)]">{item.qty}</strong>{" "}
            {item.packLabel ?? "units"} × {item.unitsPerPack} = {totalUnits.toLocaleString()} units
          </span>
          <span>
            Batch <span className="font-mono font-semibold">{item.batchNumber}</span>
          </span>
          <span>
            Exp{" "}
            {new Date(item.expiryDate).toLocaleDateString("en-KE", {
              month: "short", year: "numeric",
            })}
          </span>
        </div>
      </div>
      <div className="text-right shrink-0">
        {totalCost != null && (
          <p className="text-sm font-semibold tabular-nums">{formatKES(totalCost)}</p>
        )}
        <button
          onClick={onRemove}
          className="mt-1 w-6 h-6 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:text-[var(--pt-red)] hover:bg-[var(--pt-red-50)] transition-colors ml-auto"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

export function StockReceiveForm({ branchId, suppliers, onPosted }: Props) {
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null)
  const [receiveList, setReceiveList] = useState<ReceiveItem[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("")
  const [posting, setPosting] = useState(false)

  // Form state for the "just scanned" card
  const [pendingProduct, setPendingProduct] = useState<ProductWithStock | null>(null)
  const [pendingBatch, setPendingBatch] = useState("")
  const [pendingExpiry, setPendingExpiry] = useState("")
  const [pendingQty, setPendingQty] = useState<number>(1)
  const [pendingCost, setPendingCost] = useState<string>("")

  const { data: lookupData, isFetching } = useProductLookup(scannedBarcode, branchId)

  // When lookup resolves
  const prevBarcode = useState<string | null>(null)
  if (lookupData?.found && lookupData.product && scannedBarcode && scannedBarcode !== prevBarcode[0]) {
    prevBarcode[0] = scannedBarcode
    setPendingProduct(lookupData.product)
    setPendingBatch(lookupData.product.gtin ? `BN-${Date.now().toString().slice(-6)}` : "")
    setPendingExpiry("")
    setPendingQty(1)
    setPendingCost("")
  }

  useBarcodeScanner({
    enabled: !posting,
    onScan: (event) => {
      if (event.gtin) {
        setScannedBarcode(event.gtin)
        if (event.batchNumber) setPendingBatch(event.batchNumber)
        if (event.expiryDate) {
          setPendingExpiry(event.expiryDate.toISOString().split("T")[0]!)
        }
      }
    },
  })

  function addToList() {
    if (!pendingProduct || !pendingBatch || !pendingExpiry || pendingQty < 1) {
      toast.error("Fill in all fields before adding")
      return
    }
    setReceiveList((prev) => [
      ...prev,
      {
        productId: pendingProduct.product_id!,
        productName: pendingProduct.name!,
        gtin: pendingProduct.gtin,
        batchNumber: pendingBatch,
        expiryDate: pendingExpiry,
        qty: pendingQty,
        unitsPerPack: pendingProduct.units_per_pack ?? 1,
        packLabel: pendingProduct.pack_label,
        costPrice: pendingCost ? parseFloat(pendingCost) : null,
        supplierId: selectedSupplierId || null,
      },
    ])
    setPendingProduct(null)
    setScannedBarcode(null)
    setPendingBatch("")
    setPendingExpiry("")
    setPendingQty(1)
    setPendingCost("")
    toast.success(`${pendingProduct.name} added to receive list`)
  }

  async function postReceiving() {
    if (receiveList.length === 0) return
    setPosting(true)
    let failed = 0
    for (const item of receiveList) {
      try {
        const res = await fetch("/api/batches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: item.productId,
            branch_id: branchId,
            batch_number: item.batchNumber,
            expiry_date: item.expiryDate,
            quantity_received: item.qty * item.unitsPerPack,
            cost_price: item.costPrice,
            supplier_id: item.supplierId || undefined,
          }),
        })
        if (!res.ok) failed++
      } catch {
        failed++
      }
    }
    setPosting(false)
    if (failed > 0) {
      toast.error(`${failed} item(s) failed to post`)
    } else {
      toast.success(`${receiveList.length} batch(es) posted successfully`)
      setReceiveList([])
      onPosted()
    }
  }

  const totalCost = receiveList.reduce(
    (s, i) => s + (i.costPrice != null ? i.costPrice * i.qty : 0),
    0,
  )
  const canAdd = !!pendingProduct && !!pendingBatch && !!pendingExpiry && pendingQty >= 1

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-5">
      {/* LEFT — scan + details */}
      <div className="space-y-4">
        {/* Supplier + scan input */}
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-6 space-y-4">
          {/* Supplier */}
          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5">
              Supplier
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full h-10 px-3 border border-[var(--pt-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent bg-[var(--pt-surface)]"
            >
              <option value="">— Select supplier (optional)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Scan input */}
          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5">
              Scan delivery barcode
            </label>
            <div className="relative">
              <ScanLine
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--pt-green)]"
              />
              <input
                type="text"
                placeholder="Scan or type barcode…"
                value={scannedBarcode ?? ""}
                onChange={(e) => setScannedBarcode(e.target.value || null)}
                className="w-full h-14 pl-12 pr-28 text-[15px] border border-[var(--pt-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 bg-[var(--pt-green-50)] rounded-full text-[11px] font-semibold text-[var(--pt-green-600)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--pt-green)] animate-pulse" />
                {isFetching ? "Looking up…" : "Ready"}
              </div>
            </div>
            <p className="text-xs text-[var(--pt-text-secondary)] mt-1.5">
              {receiveList.length} item{receiveList.length !== 1 ? "s" : ""} added to this session
            </p>
          </div>
        </div>

        {/* Scanned product card */}
        {pendingProduct && (
          <div className="bg-[var(--pt-surface)] rounded-xl border-2 border-[var(--pt-green)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--pt-green-50)] text-[var(--pt-green-600)] text-xs font-semibold">
              <CheckCircle2 size={13} />
              Product found · Auto-detected
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-tertiary)] shrink-0 text-2xl">
                  💊
                </div>
                <div>
                  <p className="text-lg font-bold">{pendingProduct.name}</p>
                  <p className="text-xs font-mono text-[var(--pt-text-secondary)] mt-1">
                    {pendingProduct.gtin ?? "—"} · {pendingProduct.brand_name ?? ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
                    Batch number
                  </label>
                  <input
                    type="text"
                    value={pendingBatch}
                    onChange={(e) => setPendingBatch(e.target.value)}
                    className="w-full h-9 px-3 border border-[var(--pt-border)] rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
                    placeholder="BN240815"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
                    Expiry date
                  </label>
                  <input
                    type="date"
                    value={pendingExpiry}
                    onChange={(e) => setPendingExpiry(e.target.value)}
                    className="w-full h-9 px-3 border border-[var(--pt-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
                    Qty ({pendingProduct.pack_label ?? "packs"})
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={pendingQty}
                    onChange={(e) => setPendingQty(parseInt(e.target.value) || 1)}
                    className="w-full h-9 px-3 border border-[var(--pt-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
                  />
                  <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">
                    = {(pendingQty * (pendingProduct.units_per_pack ?? 1)).toLocaleString()} {pendingProduct.base_unit}s
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
                    Cost per {pendingProduct.pack_label ?? "unit"} (KSh)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={pendingCost}
                    onChange={(e) => setPendingCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-9 px-3 border border-[var(--pt-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
                  />
                </div>
              </div>

              <Button
                onClick={addToList}
                disabled={!canAdd}
                className="w-full gap-2 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white h-10"
              >
                <Plus size={16} />
                Add to receiving list
              </Button>
            </div>
          </div>
        )}

        {/* Tip */}
        <div className="flex gap-2.5 bg-blue-50 dark:bg-blue-500/15 border border-blue-100 rounded-xl p-4">
          <Info size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-800 leading-relaxed">
            <strong>Tip</strong> — Scan GS1-DataMatrix (small square barcode) to auto-fill batch
            number and expiry date. Linear EAN barcodes only capture the product GTIN.
          </p>
        </div>
      </div>

      {/* RIGHT — receive list */}
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--pt-border)] shrink-0">
          <div>
            <p className="text-[15px] font-bold">Receiving list</p>
            <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
              {receiveList.length} item{receiveList.length !== 1 ? "s" : ""}
              {totalCost > 0 && ` · ${formatKES(totalCost)} total`}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {receiveList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-[var(--pt-text-tertiary)]">
              <ScanLine size={32} strokeWidth={1.5} className="mb-2" />
              <p className="text-sm">Scan a product to start receiving</p>
            </div>
          ) : (
            receiveList.map((item, i) => (
              <ReceiveItemCard
                key={i}
                item={item}
                index={i}
                onRemove={() => setReceiveList((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))
          )}
        </div>

        <div className="px-5 py-4 bg-[var(--pt-muted)] border-t border-[var(--pt-border)] space-y-2 shrink-0">
          {totalCost > 0 && (
            <div className="flex justify-between text-sm text-[var(--pt-text-secondary)]">
              <span>Total value</span>
              <span className="font-semibold tabular-nums text-[var(--pt-text)]">{formatKES(totalCost)}</span>
            </div>
          )}
          <Button
            onClick={postReceiving}
            disabled={receiveList.length === 0 || posting}
            className="w-full h-11 gap-2 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold"
          >
            <CheckCircle2 size={16} />
            {posting ? "Posting…" : `Post Receiving`}
            {receiveList.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/25 text-xs font-bold">
                {receiveList.length}
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
