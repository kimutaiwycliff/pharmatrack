"use client"

import { EMPTY_ANCHORS } from "@pharmatrack/core/sync"
import { getMeta, setMeta, tillDB, type DeviceInfo } from "./db"
import { httpMessage } from "./http"
import { appVersion, readMeta, refreshTillState } from "./engine"
import { outboxCounts } from "./outbox"

// A manager/owner signed in on this browser registers it as a selling device
// (POST /api/devices/register, permission devices.manage). The server returns
// a long-lived device token ONCE; it lives in this browser's IndexedDB. Sync
// uses only that token, so an expired staff login can never block — or lose —
// a day's offline sales.

export const isDesktopApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export type RegisterResult = { ok: true; device: DeviceInfo } | { ok: false; error: string }

export async function registerThisComputer(args: { name: string; branchId: string | null; organizationId: string; organizationName?: string | null }): Promise<RegisterResult> {
  let res: Response
  try {
    res = await fetch("/api/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: args.name.trim(),
        ...(args.branchId ? { branch_id: args.branchId } : {}),
        platform: isDesktopApp() ? "desktop" : "web",
        app_version: appVersion(),
      }),
    })
  } catch {
    return { ok: false, error: "Setting up offline selling needs the internet. Connect and try again." }
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    message?: string
    token?: string
    device?: { id: string; name: string; code: string; branch_id: string; branch_name: string | null }
  }
  if (!res.ok || !body.token || !body.device) {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Only an owner or manager can set up offline selling. Ask them to sign in on this computer." }
    }
    if (res.ok) return { ok: false, error: "PharmaTrack sent an incomplete answer. Please try again." }
    return { ok: false, error: httpMessage(res.status, body.message ?? body.error) }
  }

  const device: DeviceInfo = {
    id: body.device.id, name: body.device.name, code: body.device.code, branchId: body.device.branch_id,
    branchName: body.device.branch_name, organizationId: args.organizationId, organizationName: args.organizationName ?? null,
  }
  const db = tillDB()
  const meta = await readMeta()
  // A new registration starts a fresh download (cursor null) and a fresh
  // allowance. Pending outbox items are KEPT — they upload under the new token.
  await db.transaction("rw", db.meta, db.allowances, async () => {
    await setMeta("token", body.token!, db)
    await setMeta("device", device, db)
    await setMeta("sync", { ...meta, cursor: null, deadline: null, revoked: false, subscriptionInactive: false, clock: meta.clock ?? EMPTY_ANCHORS }, db)
    await db.allowances.clear()
  })
  // Ask the browser not to clear this data under storage pressure.
  try {
    await navigator.storage?.persist?.()
  } catch {
    // not supported — fine
  }
  await refreshTillState()
  return { ok: true, device }
}

export type ForgetResult = { ok: true } | { ok: false; error: string }

/**
 * Turn offline selling off on this computer and delete its local data.
 * Refused while anything is still waiting to upload or needs attention —
 * those sales would be lost.
 */
export async function forgetThisComputer(): Promise<ForgetResult> {
  const counts = await outboxCounts()
  if (counts.pending > 0) {
    return { ok: false, error: `${counts.pending} item${counts.pending === 1 ? " is" : "s are"} still waiting to upload. Sync first, then try again.` }
  }
  if (counts.rejected > 0) {
    return { ok: false, error: `${counts.rejected} sale${counts.rejected === 1 ? "" : "s"} still need${counts.rejected === 1 ? "s" : ""} attention in the sync panel. Resolve them first.` }
  }
  const db = tillDB()
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
  await refreshTillState()
  return { ok: true }
}

export async function thisDevice(): Promise<DeviceInfo | null> {
  return getMeta("device")
}
