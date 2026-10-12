import { create } from "zustand"
import { normalizeGTIN, parseBarcode } from "@pharmatrack/core"
import type { ProductRow } from "../../db/schema"
import { env } from "../../lib/env"
import { haptics } from "../../lib/haptics"
import { requestTopUp } from "../../lib/sync/engine"
import { toast } from "../../lib/toast"
import { LIMIT_SCOPE, limitMessage, useCartStore, type AddOptions, type CapResult, type CartSellUnit } from "../../store/cart"
import { useSyncStore } from "../../store/sync"
import { findScanTarget } from "./data"
import { baseQtyInCart } from "./logic/cart"

// The POS's write actions, shared by the search list, quick-add tiles, the
// cart lines and the camera scanner, so all of them treat the stock/allowance
// cap, top-ups, toasts and haptics the same way.

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE

/**
 * Online build, connected: ask the server for `need` more units of this
 * product's allowance (R1 rule 2) and re-read the caps. False when offline,
 * in the Offline Edition, or nothing was granted.
 */
export async function topUpAllowance(productId: string, need: number): Promise<boolean> {
  if (OFFLINE_EDITION || need <= 0 || !useSyncStore.getState().online) return false
  try {
    const granted = await requestTopUp(productId, need)
    if (granted <= 0) return false
  } catch {
    return false
  }
  useCartStore.getState().refreshLimits([productId])
  return true
}

/** Tell the cashier how much is left (base units not already in the cart). */
function refuse(r: Extract<CapResult, { ok: false }>): false {
  haptics.error()
  const inCart = baseQtyInCart(useCartStore.getState().items, r.productId)
  toast.error(limitMessage(LIMIT_SCOPE, r.productName, Math.max(0, r.limit - inCart)))
  return false
}

/** Try a capped change; on refusal top up once (online) and retry. */
async function withTopUp(attempt: () => CapResult): Promise<CapResult> {
  const first = attempt()
  if (first.ok) return first
  return (await topUpAllowance(first.productId, first.wanted - first.limit)) ? attempt() : first
}

/** Add one sell unit (or `opts.count`). `quiet` skips the "added" haptic (the scanner gives its own). */
export async function addToCart(product: ProductRow, opts?: AddOptions, quiet = false): Promise<boolean> {
  const r = await withTopUp(() => useCartStore.getState().add(product, opts))
  if (!r.ok) return refuse(r)
  if (!quiet) haptics.add()
  return true
}

export async function setLineQty(key: string, qty: number): Promise<boolean> {
  const r = await withTopUp(() => useCartStore.getState().setSellQty(key, qty))
  return r.ok ? true : refuse(r)
}

/** Switch a line between the base unit and a pack size (tops up once if the packs don't fit). */
export async function setLineUnit(key: string, sellUnit: CartSellUnit | null): Promise<boolean> {
  const r = await withTopUp(() => useCartStore.getState().setSellUnit(key, sellUnit))
  if (!r.ok) return refuse(r)
  haptics.tick()
  return true
}

// ── Scanning ────────────────────────────────────────────────────────────────

interface RecentScan {
  productId: string
  name: string
}

interface RecentScansState {
  recent: RecentScan[]
  push: (scan: RecentScan) => void
}

/** "Recently scanned" chips (this session only — newest first, 8 max). */
export const useRecentScans = create<RecentScansState>((set) => ({
  recent: [],
  push(scan) {
    set((s) => ({ recent: [scan, ...s.recent.filter((r) => r.productId !== scan.productId)].slice(0, 8) }))
  },
}))

/** Candidate lookup codes for a raw scan: GS1 GTIN (normalised), then the raw text. */
export function scanCodes(raw: string): string[] {
  const event = parseBarcode(raw.trim())
  const codes = [event.gtin, event.raw]
  if (event.gtin) codes.push(normalizeGTIN(event.gtin))
  return codes.filter((c): c is string => !!c)
}

/**
 * Look a scanned code up (pack-size barcodes add that pack) and add it.
 * Success → haptic + toast with the product name; unknown → error haptic.
 * Returns the product name on success.
 */
export async function addScanned(raw: string): Promise<string | null> {
  const codes = scanCodes(raw)
  const target = await findScanTarget(codes)
  if (!target) {
    haptics.error()
    toast.error(`No product found for "${raw.trim()}"`)
    return null
  }
  const ok = await addToCart(target.product, { sellUnit: target.sellUnit }, true)
  if (!ok) return null
  haptics.success()
  const name = target.sellUnit ? `${target.product.name} · ${target.sellUnit.label}` : target.product.name
  toast.success(`Added ${name}`)
  useRecentScans.getState().push({ productId: target.product.productId, name: target.product.name })
  return name
}
