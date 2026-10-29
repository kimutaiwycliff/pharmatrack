import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNull } from "drizzle-orm"
import { dbAdmin, device, type TenantArg } from "@pharmatrack/db"
import { requireActiveSubscription } from "@/lib/auth/helpers"

// Registered devices sync with a long-lived, revocable device token instead of
// a staff session cookie, so an expired login can never block (or lose) a
// day's offline sales. The token is shown once at registration; only its
// sha256 is stored.

export type DeviceRow = typeof device.$inferSelect

export interface DeviceContext {
  device: DeviceRow
  organizationId: string
  branchId: string
  /** withTenant() argument: pinned to the device's branch. */
  tenant: TenantArg
}

export { hashDeviceToken, newDeviceToken } from "./device-token"
import { hashDeviceToken } from "./device-token"

/** Error bodies carry a `code` so the app can tell "retry later" from "re-register". */
function fail(status: number, code: string, error: string) {
  return { error: NextResponse.json({ error, code }, { status }) }
}

/**
 * `allowExpired`: a device whose temporary approval ("just today" / "7 days")
 * has ended may still upload the sales it already made — nothing sold is lost
 * — but can't pull stock or take a new stock share.
 */
export async function getDeviceContext(request: NextRequest, opts: { allowExpired?: boolean } = {}): Promise<DeviceContext | { error: NextResponse }> {
  const header = request.headers.get("authorization") ?? ""
  const token = header.startsWith("Device ") ? header.slice(7).trim() : null
  if (!token) return fail(401, "device_token_missing", "Device token required")

  const [row] = await dbAdmin().select().from(device)
    .where(and(eq(device.token_hash, hashDeviceToken(token)), isNull(device.revoked_at))).limit(1)
  if (!row) return fail(401, "device_revoked", "This device is not registered (or was removed). Ask a manager to register it again.")
  // Back-office devices (ADR-018) are approved for sign-in only — they don't sell offline.
  if (row.purpose === "office") return fail(403, "device_not_till", "This device is approved for back-office use only, not as a selling till.")
  if (!opts.allowExpired && row.approved_until && row.approved_until.getTime() <= Date.now()) {
    return fail(403, "device_approval_ended", "This device's approval has ended. Ask the owner to approve it again.")
  }

  const subErr = await requireActiveSubscription(row.organization_id)
  if (subErr) return fail(402, "subscription_inactive", "Subscription inactive — renew to keep syncing.")

  // Best-effort heartbeat; never fail the request on it.
  void dbAdmin().update(device).set({ last_seen_at: new Date() }).where(eq(device.id, row.id)).catch(() => {})

  return {
    device: row,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    tenant: { organizationId: row.organization_id, role: "device", branchId: row.branch_id, branchLocked: true },
  }
}
