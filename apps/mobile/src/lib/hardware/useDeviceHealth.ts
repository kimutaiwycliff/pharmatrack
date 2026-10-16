import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { printerHealth, scannerHealth, type DeviceHealth } from "@pharmatrack/core"
import { pickScanner } from "./logic"
import { hardware } from "./native"
import { refreshPrinterStatus } from "./printer"
import { useHardwareStore } from "./store"

const POLL_MS = 30_000

/**
 * Printer + scanner health for the POS header and settings. The printer is
 * re-checked every 30 s and when the app comes back to the foreground; the
 * scanner comes from Android's input-device list (a Bluetooth/USB scanner in
 * keyboard mode connects and disconnects like a keyboard). A till that has
 * never used a scanner shows "No scanner" (grey), not a red alarm.
 */
export function useDeviceHealth(opts: { poll?: boolean } = {}): { printer: DeviceHealth; scanner: DeviceHealth; configured: boolean } {
  const settings = useHardwareStore((s) => s.settings)
  const printer = useHardwareStore((s) => s.printer)
  const inputDevices = useHardwareStore((s) => s.inputDevices)
  const lastScanAt = useHardwareStore((s) => s.lastScanAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    useHardwareStore.getState().load()
  }, [])

  // Printer polling.
  const target = settings.target
  useEffect(() => {
    if (opts.poll === false || !target) return
    const tick = () => { setNow(Date.now()); void refreshPrinterStatus() }
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, POLL_MS)
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") tick() })
    return () => { clearTimeout(first); clearInterval(t); sub.remove() }
  }, [opts.poll, target])

  // Scanner connect/disconnect.
  useEffect(() => {
    if (!hardware) return
    useHardwareStore.getState().setInputDevices(hardware.inputDevices())
    const sub = hardware.addListener("onInputDevicesChanged", (e) => useHardwareStore.getState().setInputDevices(e.devices))
    return () => sub.remove()
  }, [])

  const device = inputDevices ? pickScanner(inputDevices) : null
  const scanner: DeviceHealth = inputDevices !== null && !device && !lastScanAt
    ? { tone: "none", label: "No scanner", detail: "No barcode scanner connected — the camera works for scanning. Pair a Bluetooth scanner or plug in a USB one to use it." }
    : scannerHealth({
        connected: inputDevices === null ? null : device !== null,
        name: device?.name ?? null,
        lastScanAt,
        now: Math.max(now, lastScanAt ?? 0),
      })

  return { configured: !!settings.target, printer: printerHealth(printer, !!settings.target), scanner }
}
