import { create } from "zustand"
import type { PrinterReplies } from "@pharmatrack/core"
import { kvGetSync, kvSetSync } from "../kv"
import { DEFAULT_PRINTER_SETTINGS, type PrinterSettings } from "./logic"
import type { InputDeviceInfo } from "./native"

// This phone/tablet's printer + scanner state. Settings live in the local
// key-value store (each till has its own printer); health is in memory and
// refreshed by useDeviceHealth.

const KEY = "printer_settings"
const SCAN_KEY = "last_hw_scan_at"

interface HardwareState {
  settings: PrinterSettings
  loaded: boolean
  printer: PrinterReplies | null
  printerCheckedAt: number | null
  /** External keyboard-type devices right now (scanners show up here). */
  inputDevices: InputDeviceInfo[] | null
  lastScanAt: number | null
  load: () => void
  update: (patch: Partial<PrinterSettings>) => void
  setPrinter: (r: PrinterReplies | null) => void
  setInputDevices: (d: InputDeviceInfo[] | null) => void
  markScan: () => void
}

export const useHardwareStore = create<HardwareState>((set, get) => ({
  settings: DEFAULT_PRINTER_SETTINGS,
  loaded: false,
  printer: null,
  printerCheckedAt: null,
  inputDevices: null,
  lastScanAt: null,
  load() {
    if (get().loaded) return
    set({
      settings: { ...DEFAULT_PRINTER_SETTINGS, ...(kvGetSync<PrinterSettings>(KEY) ?? {}) },
      lastScanAt: kvGetSync<number>(SCAN_KEY),
      loaded: true,
    })
  },
  update(patch) {
    const settings = { ...get().settings, ...patch }
    kvSetSync(KEY, settings)
    set({ settings })
  },
  setPrinter(r) {
    set({ printer: r, printerCheckedAt: Date.now() })
  },
  setInputDevices(d) {
    set({ inputDevices: d })
  },
  markScan() {
    const now = Date.now()
    // Persist at most once a minute — this runs on every hardware scan.
    const prev = get().lastScanAt ?? 0
    if (now - prev > 60_000) kvSetSync(SCAN_KEY, now)
    set({ lastScanAt: now })
  },
}))
