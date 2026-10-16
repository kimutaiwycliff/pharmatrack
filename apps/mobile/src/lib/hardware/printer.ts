import { encodeReceipt, encodeTestPage, type PaperWidth, type PrinterReplies } from "@pharmatrack/core"
import type { ReceiptData } from "../../features/pos/logic/receipt"
import { UserFacingError } from "../errors"
import { isCashPayment, receiptDocFromReceipt, targetLabel, type PrinterSettings, type PrinterTarget } from "./logic"
import { ensureBluetoothPermission, hardware, type BondedDevice } from "./native"
import { useHardwareStore } from "./store"

// Direct receipt printing on Android: the shared ESC/POS receipt
// (@pharmatrack/core) sent over Bluetooth, USB or the network by
// modules/pt-hardware. Without the native module (older APK) nothing here is
// offered and the receipt screen keeps its share-a-PDF flow.

function need() {
  if (!hardware) throw new UserFacingError("Update the app to print directly to a receipt printer.")
  return hardware
}

async function send(target: PrinterTarget, bytes: Uint8Array): Promise<void> {
  const h = need()
  if (target.kind === "bluetooth" && !(await ensureBluetoothPermission())) {
    throw new UserFacingError("Allow “Nearby devices” for PharmaTrack to use the Bluetooth printer.")
  }
  try {
    await h.send(target.kind, target.address, target.port, Array.from(bytes))
  } catch (err) {
    throw new UserFacingError(err instanceof Error ? err.message : "Couldn't reach the printer")
  }
}

export function paperFor(settings: PrinterSettings, orgDefault?: string | null): PaperWidth {
  return settings.paper ?? (orgDefault === "58mm" ? "58mm" : "80mm")
}

/** Print a sale's receipt on this till's printer (and pulse the drawer for cash). */
export async function printReceipt(r: ReceiptData, opts: { paper: PaperWidth; branchName?: string | null }): Promise<void> {
  const { settings } = useHardwareStore.getState()
  if (!settings.target) throw new UserFacingError("No receipt printer is set up — More → Settings → Printer & scanner.")
  const doc = receiptDocFromReceipt(r, { branchName: opts.branchName })
  await send(settings.target, encodeReceipt(doc, {
    paper: opts.paper, openDrawer: settings.openDrawer && isCashPayment(r.paymentLabel), copies: settings.copies,
  }))
  void refreshPrinterStatus()
}

export async function printTestPage(target: PrinterTarget, paper: PaperWidth, shopName?: string | null): Promise<void> {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date()).replace(",", "")
  await send(target, encodeTestPage({ paper, printerName: target.label, shopName, when }))
}

/** Ask the printer how it is; never throws. */
export async function checkPrinter(target: PrinterTarget): Promise<PrinterReplies> {
  if (!hardware) return { reachable: false, error: "This version of the app can't talk to printers — update it." }
  if (target.kind === "bluetooth") {
    if (!hardware.bluetoothState().enabled) return { reachable: false, error: "Bluetooth is off — switch it on." }
    if (!(await ensureBluetoothPermission())) return { reachable: false, error: "Allow “Nearby devices” for PharmaTrack to check the printer." }
  }
  try {
    return await hardware.status(target.kind, target.address, target.port)
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : "Couldn't reach the printer" }
  }
}

export async function refreshPrinterStatus(): Promise<void> {
  const { settings, setPrinter } = useHardwareStore.getState()
  setPrinter(settings.target ? await checkPrinter(settings.target) : null)
}

export interface PrinterChoice { target: PrinterTarget; hint: string; recommended: boolean }

/** Paired Bluetooth printers + plugged-in USB printers this device can use. */
export async function findPrinters(): Promise<{ choices: PrinterChoice[]; bluetoothOff: boolean; bluetoothDenied: boolean }> {
  const h = need()
  const choices: PrinterChoice[] = []
  const bt = h.bluetoothState()
  let bluetoothDenied = false
  if (bt.enabled) {
    if (await ensureBluetoothPermission()) {
      const bonded: BondedDevice[] = h.bondedDevices()
      for (const d of bonded) {
        if (d.isKeyboard && !d.isPrinter) continue // a paired scanner/keyboard
        const name = d.isBuiltIn ? "Built-in printer" : d.name
        choices.push({
          target: { kind: "bluetooth", address: d.address, port: 0, label: targetLabel("bluetooth", name) },
          hint: d.isBuiltIn ? "This terminal’s own printer (Sunmi and similar)" : d.isPrinter ? "Paired Bluetooth printer" : "Paired Bluetooth device",
          recommended: d.isBuiltIn || d.isPrinter,
        })
      }
    } else bluetoothDenied = true
  }
  for (const u of h.usbDevices()) {
    if (!u.isPrinter) continue
    choices.push({
      target: { kind: "usb", address: u.address, port: 0, label: targetLabel("usb", u.name || "USB printer") },
      hint: u.hasPermission ? "Plugged in by USB" : "Plugged in by USB — PharmaTrack will ask for permission",
      recommended: true,
    })
  }
  choices.sort((a, b) => Number(b.recommended) - Number(a.recommended))
  return { choices, bluetoothOff: bt.supported && !bt.enabled, bluetoothDenied }
}

/** USB printers need a one-time "allow" from Android before we can print. */
export async function ensureUsbPermission(target: PrinterTarget): Promise<void> {
  if (target.kind !== "usb") return
  const ok = await need().requestUsbPermission(target.address)
  if (!ok) throw new UserFacingError("PharmaTrack needs permission to use the USB printer — tap Allow when asked.")
}
