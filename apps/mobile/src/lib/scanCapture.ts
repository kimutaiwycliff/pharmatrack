import { router } from "expo-router"

// R3: one-shot camera scan for forms (Receive stock, Receive delivery, product
// barcode). `await captureScan()` opens app/scan.tsx in capture mode, which
// hands back the first code read (or null if closed) instead of adding to the
// POS cart. Pair with @pharmatrack/core's parseBarcode() for GS1 fields.

let pending: ((code: string | null) => void) | null = null

export function captureScan(): Promise<string | null> {
  pending?.(null)
  return new Promise((resolve) => {
    pending = resolve
    router.push({ pathname: "/scan", params: { mode: "capture" } })
  })
}

/** Called by the scan screen with the code read, or null when it closes empty. */
export function deliverScan(code: string | null): void {
  const p = pending
  pending = null
  p?.(code)
}
