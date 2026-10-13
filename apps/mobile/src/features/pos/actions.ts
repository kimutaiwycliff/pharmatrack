import { create } from "zustand"
import { normalizeGTIN, parseBarcode } from "@pharmatrack/core"
import type { ProductRow } from "../../db/schema"
import { env } from "../../lib/env"
import { haptics } from "../../lib/haptics"
import { requestTopUp } from "../../lib/sync/engine"
import { toast } from "../../lib/toast"
import { useCartStore, type AddOptions, type CapResult, type CartSellUnit } from "../../store/cart"
import { useSyncStore } from "../../store/sync"
import { findScanTarget } from "./data"
import { baseQtyInCart } from "./logic/cart"
import { refusalMessage, type TopUpOutcome } from "./logic/topUp"

// The POS's write actions, shared by the search list, quick-add tiles, the
// cart lines and the camera scanner, so all of them treat the stock/allowance
// cap, top-ups, toasts and haptics the same way.

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE

// Top-ups in flight, per product. A repeat tap while the server is being
// asked is ignored (it would only send another request), not refused.
const topUpsInFlight = new Map<string, Promise<TopUpOutcome>>()
const BUSY = Symbol("busy")

/**
 * Online build, connected: ask the server for `need` more units of this
 * product's allowance (R1 rule 2) and re-read the caps. Says what happened so
 * the cashier hears "no connection" vs. "none left" (logic/topUp.ts).
 * A "Checking stock…" toast covers the wait (the request can take seconds).
 */
export async function requestMoreAllowance(productId: string, need: number, productName?: string): Promise<TopUpOutcome> {
  if (OFFLINE_EDITION || need <= 0) return "skipped"
  if (!useSyncStore.getState().online) return "offline"
  const running = topUpsInFlight.get(productId)
  if (running) return running
  const checking = toast.info(productName ? `Checking stock for ${productName}…` : "Checking stock…")
  const run = (async (): Promise<TopUpOutcome> => {
    let granted = 0
    try {
      granted = await requestTopUp(productId, need)
    } catch {
      return "network"
    }
    if (granted > 0) {
      useCartStore.getState().refreshLimits([productId])
      return "granted"
    }
    // requestTopUp() throws on a connection failure (caught above), so 0 here
    // means the branch really has none to spare.
    return "none"
  })()
  topUpsInFlight.set(productId, run)
  try {
    return await run
  } finally {
    topUpsInFlight.delete(productId)
    toast.dismiss(checking)
  }
}

/** Boolean form for the checkout retry in the POS screen: true when more was granted. */
export async function topUpAllowance(productId: string, need: number): Promise<boolean> {
  return (await requestMoreAllowance(productId, need)) === "granted"
}

/** Tell the cashier how much is left (base units not already in the cart) and why. */
function refuse(r: Extract<CapResult, { ok: false }>, outcome: TopUpOutcome): false {
  haptics.error()
  const inCart = baseQtyInCart(useCartStore.getState().items, r.productId)
  toast.error(refusalMessage({ offlineEdition: OFFLINE_EDITION, outcome, name: r.productName, available: Math.max(0, r.limit - inCart) }))
  return false
}

/** Try a capped change; on refusal top up once (online) and retry. */
async function withTopUp(attempt: () => CapResult): Promise<{ r: CapResult; outcome: TopUpOutcome } | typeof BUSY> {
  const first = attempt()
  if (first.ok) return { r: first, outcome: "skipped" }
  // Another tap on this product is already waiting for the server.
  if (topUpsInFlight.has(first.productId)) return BUSY
  const outcome = await requestMoreAllowance(first.productId, first.wanted - first.limit, first.productName)
  return { r: outcome === "granted" ? attempt() : first, outcome }
}

/** Add one sell unit (or `opts.count`). `quiet` skips the "added" haptic (the scanner gives its own). */
export async function addToCart(product: ProductRow, opts?: AddOptions, quiet = false): Promise<boolean> {
  const res = await withTopUp(() => useCartStore.getState().add(product, opts))
  if (res === BUSY) return false
  if (!res.r.ok) return refuse(res.r, res.outcome)
  if (!quiet) haptics.add()
  return true
}

export async function setLineQty(key: string, qty: number): Promise<boolean> {
  const res = await withTopUp(() => useCartStore.getState().setSellQty(key, qty))
  if (res === BUSY) return false
  return res.r.ok ? true : refuse(res.r, res.outcome)
}

/** Switch a line between the base unit and a pack size (tops up once if the packs don't fit). */
export async function setLineUnit(key: string, sellUnit: CartSellUnit | null): Promise<boolean> {
  const res = await withTopUp(() => useCartStore.getState().setSellUnit(key, sellUnit))
  if (res === BUSY) return false
  if (!res.r.ok) return refuse(res.r, res.outcome)
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
