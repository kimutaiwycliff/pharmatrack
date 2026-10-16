"use client"

// Direct printing over Web Serial (Chrome/Edge on Windows, macOS, ChromeOS and
// Android). Covers USB printers that show up as a serial/COM port and
// Bluetooth (classic, serial profile) printers that are paired with the device.
// USB printers that Windows drives as a printer queue don't appear here — use
// the browser dialog or the desktop app for those.
import { statusRequest, type PrinterReplies } from "@pharmatrack/core"

// Minimal Web Serial typings (not in TypeScript's DOM lib yet).
interface SerialPortInfo { usbVendorId?: number; usbProductId?: number; bluetoothServiceClassId?: number | string }
interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(opts: { baudRate: number }): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
}
interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(opts?: { filters?: SerialPortInfo[]; allowedBluetoothServiceClassIds?: string[] }): Promise<SerialPortLike>
}

/** Serial Port Profile — what Bluetooth receipt printers speak. */
const SPP_UUID = "00001101-0000-1000-8000-00805f9b34fb"

function serial(): SerialLike | null {
  return typeof navigator !== "undefined" && "serial" in navigator ? (navigator as unknown as { serial: SerialLike }).serial : null
}

export function webSerialSupported(): boolean {
  return serial() !== null
}

export interface SerialChoice { usbVendorId?: number; usbProductId?: number; label: string }
export type SerialTarget = { usbVendorId?: number; usbProductId?: number; baud: number }

/** Ask the user to pick the printer's port (must run from a click). */
export async function chooseSerialPrinter(): Promise<SerialChoice> {
  const s = serial()
  if (!s) throw new Error("This browser can't talk to printers directly — use Chrome or Edge, or the browser print dialog.")
  const port = await s.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] })
  const info = port.getInfo()
  const hex = (n: number) => n.toString(16).padStart(4, "0")
  const label = info.usbVendorId != null
    ? `USB printer ${hex(info.usbVendorId)}:${hex(info.usbProductId ?? 0)}`
    : info.bluetoothServiceClassId ? "Bluetooth printer" : "Serial printer"
  return { usbVendorId: info.usbVendorId, usbProductId: info.usbProductId, label }
}

/** The previously chosen port, if the browser still allows it (no prompt). */
async function findPort(t: SerialTarget): Promise<SerialPortLike | null> {
  const s = serial()
  if (!s) return null
  const ports = await s.getPorts()
  if (t.usbVendorId != null) {
    return ports.find((p) => p.getInfo().usbVendorId === t.usbVendorId && p.getInfo().usbProductId === t.usbProductId) ?? null
  }
  // Bluetooth ports have no USB ids: use the granted non-USB one.
  return ports.find((p) => p.getInfo().usbVendorId == null) ?? null
}

// One open port per page; printing and status checks queue behind each other.
let openPort: SerialPortLike | null = null
let chain: Promise<unknown> = Promise.resolve()
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.catch(() => undefined)
  return run
}

async function ensureOpen(t: SerialTarget): Promise<SerialPortLike> {
  const port = await findPort(t)
  if (!port) throw new Error("The printer isn't connected, or permission was removed — choose it again in Settings → Printer & scanner.")
  if (openPort && openPort !== port) await openPort.close().catch(() => undefined)
  if (!port.writable) await port.open({ baudRate: t.baud })
  openPort = port
  return port
}

async function write(port: SerialPortLike, bytes: Uint8Array): Promise<void> {
  const writer = port.writable!.getWriter()
  try {
    await writer.write(bytes)
  } finally {
    writer.releaseLock()
  }
}

/** Read one status byte, or null if the printer doesn't answer in time. */
async function readByte(port: SerialPortLike, timeoutMs: number): Promise<number | null> {
  if (!port.readable) return null
  const reader = port.readable.getReader()
  const timer = setTimeout(() => void reader.cancel().catch(() => undefined), timeoutMs)
  try {
    const { value } = await reader.read()
    return value && value.length ? value[value.length - 1]! : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

export function serialPrint(t: SerialTarget, bytes: Uint8Array): Promise<void> {
  return exclusive(async () => {
    try {
      await write(await ensureOpen(t), bytes)
    } catch (err) {
      openPort = null
      throw err
    }
  })
}

export function serialStatus(t: SerialTarget): Promise<PrinterReplies> {
  return exclusive(async () => {
    let port: SerialPortLike
    try {
      port = await ensureOpen(t)
    } catch (err) {
      openPort = null
      return { reachable: false, error: err instanceof Error ? err.message : "Can't open the printer" }
    }
    const ask = async (n: 1 | 2 | 4) => {
      await write(port, statusRequest(n))
      return readByte(port, 700)
    }
    try {
      const printer = await ask(1)
      // Printers that ignore status requests don't answer the first one either.
      if (printer == null) return { reachable: true }
      return { reachable: true, printer, offline: await ask(2), paper: await ask(4) }
    } catch (err) {
      openPort = null
      return { reachable: false, error: err instanceof Error ? err.message : "The printer stopped responding" }
    }
  })
}
