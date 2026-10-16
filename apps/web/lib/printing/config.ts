"use client"

// This till's receipt-printer setup. It belongs to the machine (each till has
// its own printer), so it lives in this browser's storage, not on the server.
// Also holds the live device health shown in the POS header.
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { PaperWidth, PrinterReplies } from "@pharmatrack/core"

/**
 * How receipts reach the printer:
 *  - browser: the browser's print dialog (any printer Windows/Android knows).
 *  - serial:  direct ESC/POS over Web Serial (USB-serial or Bluetooth printers, Chrome/Edge).
 *  - desktop: the PharmaTrack desktop app's native printing (USB, Bluetooth COM, network, Windows queue).
 */
export type PrintMode = "browser" | "serial" | "desktop"

/** A printer as the desktop app addresses it (mirrors src-tauri/src/printing.rs). */
export type DesktopTarget =
  | { kind: "network"; host: string; port: number }
  | { kind: "serial"; path: string; baud: number }
  | { kind: "system"; name: string }

export interface PrinterConfig {
  mode: PrintMode
  /** null = use the organisation's default from Settings → Organization. */
  paper: PaperWidth | null
  autoPrint: boolean
  openDrawer: boolean
  copies: number
  /** Web Serial: which port to reopen without asking (USB ids), and its speed. */
  serial: { usbVendorId?: number; usbProductId?: number; baud: number; label: string } | null
  desktop: (DesktopTarget & { label: string }) | null
}

export const DEFAULT_PRINTER: PrinterConfig = {
  mode: "browser", paper: null, autoPrint: false, openDrawer: false, copies: 1, serial: null, desktop: null,
}

interface PrinterStore {
  config: PrinterConfig
  setConfig: (patch: Partial<PrinterConfig>) => void
}

export const usePrinterConfig = create<PrinterStore>()(
  persist(
    (set) => ({
      config: DEFAULT_PRINTER,
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
    }),
    { name: "pt-printer", version: 1 },
  ),
)

/** Is a direct printer set up (anything other than the browser dialog)? */
export function hasDirectPrinter(c: PrinterConfig): boolean {
  return (c.mode === "serial" && !!c.serial) || (c.mode === "desktop" && !!c.desktop)
}

interface DeviceStore {
  /** When the last hardware (keyboard-wedge) scan arrived. */
  lastScanAt: number | null
  lastScanCode: string | null
  printer: PrinterReplies | null
  printerCheckedAt: number | null
  markScan: (code: string) => void
  setPrinter: (r: PrinterReplies | null) => void
}

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set) => ({
      lastScanAt: null,
      lastScanCode: null,
      printer: null,
      printerCheckedAt: null,
      markScan: (code) => set({ lastScanAt: Date.now(), lastScanCode: code }),
      setPrinter: (r) => set({ printer: r, printerCheckedAt: Date.now() }),
    }),
    // Only the scan heartbeat survives a reload; printer health is re-checked.
    { name: "pt-devices", version: 1, partialize: (s) => ({ lastScanAt: s.lastScanAt, lastScanCode: s.lastScanCode }) },
  ),
)
