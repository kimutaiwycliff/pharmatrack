import { requireOptionalNativeModule } from "expo"
import { PermissionsAndroid, Platform } from "react-native"
import type { PrinterReplies } from "@pharmatrack/core"

// Typed access to modules/pt-hardware (Kotlin). Optional: an APK built before
// the module existed (≤ 1.2.x), Expo Go and tests get `null`, and every caller
// falls back to the share-a-PDF receipt flow.

export type PrinterKind = "bluetooth" | "network" | "usb"

export interface BondedDevice { address: string; name: string; isPrinter: boolean; isBuiltIn: boolean; isKeyboard: boolean }
export interface UsbDeviceInfo { address: string; vendorId: number; productId: number; name: string; manufacturer: string | null; isPrinter: boolean; hasPermission: boolean }
export interface InputDeviceInfo { id: number; name: string; vendorId: number; productId: number; likelyScanner: boolean }
interface Subscription { remove(): void }

interface PtHardwareNative {
  bluetoothState(): { supported: boolean; enabled: boolean }
  bondedDevices(): BondedDevice[]
  usbDevices(): UsbDeviceInfo[]
  requestUsbPermission(address: string): Promise<boolean>
  inputDevices(): InputDeviceInfo[]
  send(kind: PrinterKind, address: string, port: number, data: number[]): Promise<void>
  status(kind: PrinterKind, address: string, port: number): Promise<PrinterReplies>
  disconnect(address: string): void
  addListener(event: "onInputDevicesChanged", cb: (e: { devices: InputDeviceInfo[] }) => void): Subscription
}

const mod = Platform.OS === "android" ? requireOptionalNativeModule<PtHardwareNative>("PtHardware") : null

export const hardware = mod

/** Does this app build include direct printer support? */
export function hardwareAvailable(): boolean {
  return mod !== null
}

/** Android 12+ needs "Nearby devices" to talk to paired Bluetooth printers. */
export async function ensureBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false
  if (typeof Platform.Version === "number" && Platform.Version < 31) return true
  const perm = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
  if (await PermissionsAndroid.check(perm)) return true
  return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED
}
