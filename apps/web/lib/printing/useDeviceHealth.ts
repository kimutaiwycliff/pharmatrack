"use client"

import { useCallback, useEffect, useState } from "react"
import { printerHealth, scannerHealth, type DeviceHealth } from "@pharmatrack/core"
import { hasDirectPrinter, useDeviceStore, usePrinterConfig } from "./config"
import { checkPrinter } from "./printer"

const POLL_MS = 30_000

/**
 * Printer + scanner health for the POS header and settings. Re-checks the
 * printer every 30 s, when the window regains focus and on demand (`recheck`);
 * the scanner is judged from the last hardware scan.
 */
export function useDeviceHealth(opts: { poll?: boolean } = {}): {
  printer: DeviceHealth
  scanner: DeviceHealth
  direct: boolean
  recheck: () => Promise<void>
} {
  const config = usePrinterConfig((s) => s.config)
  const printer = useDeviceStore((s) => s.printer)
  const lastScanAt = useDeviceStore((s) => s.lastScanAt)
  const setPrinter = useDeviceStore((s) => s.setPrinter)
  const direct = hasDirectPrinter(config)
  const [now, setNow] = useState(() => Date.now())

  const recheck = useCallback(async () => {
    setNow(Date.now())
    if (!hasDirectPrinter(config)) { setPrinter(null); return }
    setPrinter(await checkPrinter(config))
  }, [config, setPrinter])

  useEffect(() => {
    if (opts.poll === false) return
    const first = setTimeout(() => void recheck(), 0)
    const t = setInterval(() => void recheck(), POLL_MS)
    const onFocus = () => void recheck()
    window.addEventListener("focus", onFocus)
    return () => { clearTimeout(first); clearInterval(t); window.removeEventListener("focus", onFocus) }
  }, [recheck, opts.poll])

  return {
    printer: direct
      ? printerHealth(printer, true)
      : { tone: "none", label: "Browser printing", detail: "Receipts print through the browser's print dialog. Set up a direct printer in Settings → Printer & scanner." },
    scanner: scannerHealth({ lastScanAt, now: Math.max(now, lastScanAt ?? 0) }),
    direct,
    recheck,
  }
}
