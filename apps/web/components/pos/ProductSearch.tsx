"use client"

import { useState, useRef, useCallback } from "react"
import { Search, ScanBarcode, Plus, AlertCircle } from "lucide-react"
import { useCartStore } from "@/lib/store/cartStore"
import { useBarcodeScanner } from "@/lib/barcode/useBarcodeScanner"
import type { BarcodeScanEvent } from "@/lib/barcode/barcodeParser"
import { CameraScanner } from "./CameraScanner"
import { useProductLookup } from "@/lib/hooks/useProductLookup"
import { useQuery } from "@tanstack/react-query"
import { formatKES } from "@/lib/store/cartStore"
import { cacheProduct, cacheProducts, searchCachedProducts } from "@/lib/offline/db"
import type { ProductWithStock } from "@pharmatrack/types"

interface Props {
  branchId: string
  onBarcodeNotFound?: (barcode: string) => void
  scannerEnabled?: boolean
}

function useProductSearch(q: string, branchId: string) {
  return useQuery<{ products: ProductWithStock[] }>({
    queryKey: ["productSearch", q, branchId],
    queryFn: async () => {
      try {
        const res = await fetch(
          `/api/products/search?q=${encodeURIComponent(q)}&branch_id=${branchId}`,
        )
        if (!res.ok) throw new Error("Search failed")
        const json = (await res.json()) as { products: ProductWithStock[] }
        // Keep the local cache warm so search/scan keep working offline.
        cacheProducts(json.products).catch(() => {})
        return json
      } catch {
        const cached = await searchCachedProducts(q, branchId)
        return { products: cached }
      }
    },
    enabled: branchId.length > 0,
    staleTime: 30_000,
    gcTime: 60_000,
    // Run the queryFn even when offline (default "online" PAUSES queries with no
    // network, which would skip the Dexie fallback above → offline search broken).
    networkMode: "always",
  })
}

export function ProductSearch({ branchId, onBarcodeNotFound, scannerEnabled = true }: Props) {
  const [searchText, setSearchText] = useState("")
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null)
  const [recentScans, setRecentScans] = useState<string[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const addItem = useCartStore((s) => s.addItem)

  const { data: lookupData, isFetching: lookupFetching } = useProductLookup(
    scannedBarcode,
    branchId,
  )

  const { data: searchData, isFetching: searchFetching } = useProductSearch(searchText, branchId)
  const { data: featuredData } = useProductSearch("", branchId)

  // Learned most-sold products for this branch → lead the quick-add grid.
  const { data: topData } = useQuery<{ products: ProductWithStock[] }>({
    queryKey: ["topProducts", branchId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/products/top?branch_id=${branchId}`)
        if (!res.ok) throw new Error("top failed")
        const json = (await res.json()) as { products: ProductWithStock[] }
        cacheProducts(json.products).catch(() => {})
        return json
      } catch {
        return { products: [] } // offline → catalogue fills the grid below
      }
    },
    enabled: branchId.length > 0,
    staleTime: 5 * 60_000,
    networkMode: "always",
  })

  // Warm the offline cache with the WHOLE branch catalogue once on load (while
  // online), so a later outage can search/scan any product — not just ones the
  // cashier happened to open. Failures (e.g. already offline) are ignored.
  useQuery({
    queryKey: ["branchCatalogPrefetch", branchId],
    queryFn: async () => {
      const res = await fetch(`/api/products/search?all=1&branch_id=${branchId}`)
      if (!res.ok) return { cached: 0 }
      const json = (await res.json()) as { products: ProductWithStock[] }
      await cacheProducts(json.products)
      return { cached: json.products.length }
    },
    enabled: branchId.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    networkMode: "always",
  })

  const handleProductAdd = useCallback(
    (product: ProductWithStock) => {
      addItem(product)
      if (product.name) {
        setRecentScans((prev) => {
          const filtered = prev.filter((n) => n !== product.name)
          return [product.name!, ...filtered].slice(0, 6)
        })
      }
      cacheProduct(product).catch(() => {})
    },
    [addItem],
  )

  const prevLookup = useRef<string | null>(null)
  // Process each barcode lookup result exactly once.
  /* eslint-disable react-hooks/refs */
  if (lookupData && scannedBarcode && prevLookup.current !== scannedBarcode) {
    prevLookup.current = scannedBarcode
    if (lookupData.found && lookupData.product) {
      handleProductAdd(lookupData.product)
      setScannedBarcode(null)
    } else {
      onBarcodeNotFound?.(scannedBarcode)
      setScannedBarcode(null)
    }
  }
  /* eslint-enable react-hooks/refs */

  // Shared by the USB wedge and the camera scanner — both produce a parsed event.
  const handleScannedEvent = useCallback((event: BarcodeScanEvent) => {
    if (!event.gtin) return
    setScannedBarcode(event.gtin)
    setSearchText("")
  }, [])

  useBarcodeScanner({
    enabled: scannerEnabled && !cameraOpen,
    onScan: handleScannedEvent,
  })

  const displayProducts = searchText.length >= 2 ? (searchData?.products ?? []) : []
  // Quick-add: most-sold first (learned), then fill from the catalogue, de-duped.
  const quickAdd = (() => {
    const seen = new Set<string>()
    const out: ProductWithStock[] = []
    for (const p of [...(topData?.products ?? []), ...(featuredData?.products ?? [])]) {
      if (p.product_id && !seen.has(p.product_id)) { seen.add(p.product_id); out.push(p) }
      if (out.length >= 8) break
    }
    return out
  })()
  const isLoading = lookupFetching || searchFetching

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 gap-4 sm:gap-5 overflow-hidden">
      {/* Search input */}
      <div className="relative shrink-0">
        <Search
          size={17}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]"
        />
        <input
          type="text"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value)
            setScannedBarcode(null)
          }}
          placeholder="Scan barcode or search product…"
          className="w-full h-14 pl-12 pr-14 text-[15px] border border-[var(--pt-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent bg-[var(--pt-surface)]"
        />
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          aria-label="Scan with camera"
          title="Scan with camera"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[var(--pt-text-secondary)] hover:text-[var(--pt-green-600)] hover:bg-[var(--pt-muted-strong)] transition-colors"
        >
          <ScanBarcode size={18} />
        </button>
      </div>

      {cameraOpen && (
        <CameraScanner onScan={handleScannedEvent} onClose={() => setCameraOpen(false)} />
      )}

      {/* Scanner status */}
      <div className="shrink-0">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
            isLoading
              ? "bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          {isLoading ? "Looking up…" : "Scanner ready · USB/Keyboard"}
        </div>
      </div>

      {/* Inline search results */}
      {searchText.length >= 2 && (
        <div className="shrink-0 max-h-52 overflow-y-auto rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)]">
          {displayProducts.length === 0 && !searchFetching && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--pt-text-secondary)]">
              <AlertCircle size={15} />
              No products found — scan barcode to register new
            </div>
          )}
          {displayProducts.map((p) => (
            <button
              key={p.product_id}
              onClick={() => {
                handleProductAdd(p)
                setSearchText("")
              }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--pt-muted)] text-left border-b border-[var(--pt-border)] last:border-b-0 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name ?? ""} loading="lazy" decoding="async" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[var(--pt-border)] bg-[var(--pt-muted)]" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] flex items-center justify-center shrink-0 text-sm">💊</div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-[var(--pt-text-secondary)]">
                    {[p.strength, p.dosage_form].filter(Boolean).join(" · ")} · {p.stock_on_hand ?? 0} in stock
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="text-sm font-bold tabular-nums">{formatKES(p.selling_price ?? 0)}</span>
                <div className="w-6 h-6 rounded-md bg-[var(--pt-green-50)] flex items-center justify-center text-[var(--pt-green)]">
                  <Plus size={13} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Recently scanned */}
      {recentScans.length > 0 && searchText.length < 2 && (
        <div className="shrink-0">
          <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider mb-2">
            Recently scanned
          </p>
          <div className="flex flex-wrap gap-2">
            {recentScans.map((name) => {
              const product = featuredData?.products.find((x) => x.name === name)
              return (
                <button
                  key={name}
                  onClick={() => product && handleProductAdd(product)}
                  disabled={!product}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[var(--pt-border)] bg-[var(--pt-surface)] text-xs font-medium hover:bg-[var(--pt-muted)] transition-colors disabled:opacity-50"
                >
                  <Plus size={11} className="text-[var(--pt-green)]" />
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick add grid */}
      {searchText.length < 2 && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider mb-2 shrink-0">
            Quick add
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 content-start">
            {quickAdd.map((p) => (
              <button
                key={p.product_id}
                onClick={() => handleProductAdd(p)}
                className="bg-[var(--pt-surface)] border border-[var(--pt-border)] rounded-xl p-2.5 text-left flex flex-col hover:border-[var(--pt-green)] hover:shadow-sm transition-all min-h-[140px]"
              >
                <div className="w-full aspect-square rounded-lg bg-[var(--pt-muted)] mb-2 overflow-hidden flex items-center justify-center border border-[var(--pt-border)]">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name ?? ""} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">💊</span>
                  )}
                </div>
                <p className="text-xs font-semibold leading-tight line-clamp-2">{p.name}</p>
                <div className="flex justify-between items-center mt-auto pt-1.5">
                  <span className="text-[10px] text-[var(--pt-text-secondary)]">
                    {p.stock_on_hand ?? 0} stk
                  </span>
                  <span className="text-xs font-bold tabular-nums">{formatKES(p.selling_price ?? 0)}</span>
                </div>
              </button>
            ))}
            {quickAdd.length === 0 && (
              <div className="col-span-full text-center text-sm text-[var(--pt-text-tertiary)] py-8">
                No products in inventory yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
