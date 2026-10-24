import { Platform } from "react-native"
import Constants from "expo-constants"
import * as SecureStore from "expo-secure-store"
import { apiFetch } from "../api-fetch"
import { httpMessage, userMessage } from "../errors"
import { kvGetSync, kvSetSync } from "../kv"
import { sqlite } from "../../db/database"
import { EMPTY_ANCHORS } from "./core/clock"
import { DEVICE_TOKEN_KEY, readDeviceToken } from "./device-key"

// R1 rule 1 — a phone must be registered to sell. A manager/owner signed in
// online (permission devices.manage) registers it once; the server returns a
// long-lived device token ONCE (apps/web/app/api/devices/register/route.ts).
// The token lives in SecureStore; the non-secret device details in kv_store.
// Sync uses only the token, so an expired staff login can never block a
// day's offline sales from uploading.

const TOKEN_KEY = DEVICE_TOKEN_KEY
const DEVICE_KEY = "sync_device"
export const META_KEY = "sync_meta"

export interface DeviceInfo {
  id: string
  name: string
  code: string
  branchId: string
  branchName: string | null
  organizationName?: string | null
}

// The JS bundle's own version, reported to the server as the device's
// app_version. It moves on over-the-air updates, while the native `version`
// (app.config.ts) only moves with a new APK — so the server can tell which
// phones already have a JS-only feature, e.g. 1.3.1 sends its device key at
// sign-in (ADR-018). Bump it whenever a server feature depends on new JS.
export const APP_BUNDLE_VERSION = "1.3.1"
export const appVersion = (): string => APP_BUNDLE_VERSION || (Constants.expoConfig?.version ?? "0.0.0")

export async function getDeviceToken(): Promise<string | null> {
  return readDeviceToken()
}

export function getDeviceInfo(): DeviceInfo | null {
  return kvGetSync<DeviceInfo>(DEVICE_KEY)
}

export function saveDeviceInfo(info: DeviceInfo): void {
  kvSetSync(DEVICE_KEY, info)
}

export type RegisterResult = { ok: true; device: DeviceInfo } | { ok: false; error: string }

export async function registerDevice(name: string, branchId?: string | null): Promise<RegisterResult> {
  let res: Response
  try {
    res = await apiFetch("/api/devices/register", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        ...(branchId ? { branch_id: branchId } : {}),
        platform: Platform.OS,
        app_version: appVersion(),
      }),
    })
  } catch (err) {
    return { ok: false, error: userMessage(err) }
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    token?: string
    device?: { id: string; name: string; code: string; branch_id: string; branch_name: string | null }
  }
  if (!res.ok || !body.token || !body.device) {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Only a manager or owner can register a phone. Sign in as a manager and try again." }
    }
    if (res.ok) return { ok: false, error: "The server sent an incomplete answer. Please try registering again." }
    return { ok: false, error: httpMessage(res.status, body.error) }
  }

  const device: DeviceInfo = {
    id: body.device.id,
    name: body.device.name,
    code: body.device.code,
    branchId: body.device.branch_id,
    branchName: body.device.branch_name,
  }
  await adoptDeviceKey(body.token, device)
  return { ok: true, device }
}

/**
 * Make this phone a registered till with the given key — after registration,
 * or after a device approval (ADR-018), where the approval request's secret
 * became the key.
 */
export async function adoptDeviceKey(token: string, device: DeviceInfo): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
  // A new registration starts a fresh download (cursor null) and a fresh
  // allowance. Pending outbox items are KEPT — they upload under the new token.
  sqlite.withTransactionSync(() => {
    saveDeviceInfo(device)
    const meta = kvGetSync<Record<string, unknown>>(META_KEY) ?? {}
    kvSetSync(META_KEY, {
      ...meta,
      cursor: null,
      deadline: null,
      revoked: false,
      subscriptionInactive: false,
      clock: (meta.clock as unknown) ?? EMPTY_ANCHORS,
    })
    sqlite.runSync("DELETE FROM allowances")
  })
}
