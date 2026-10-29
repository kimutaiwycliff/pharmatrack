import { and, asc, eq, inArray } from "drizzle-orm"
import { audit_log, branch, dbAdmin, device_request, organization, staff_profile, user } from "@pharmatrack/db"
import { DEVICE_USES, approvedUntil, canApproveDevices, type ApprovalDuration, type DeviceAccess, type DevicePurpose, type DeviceUse } from "@pharmatrack/core"
import { loadPermissions } from "@/lib/auth/helpers"
import { hashDeviceToken } from "@/lib/sync/device-token"
import { verifyPin } from "@/lib/auth/pin"
import { normalizeKePhone } from "@/lib/auth/phone"
import { failedAttempt, lockedMessage, succeeded } from "@/lib/auth/lockout"
import { lockRemaining, retryText } from "@/lib/rate-limit"
import { createDevice, type CreatedDevice } from "@/lib/devices/create"
import { expireStaleRequests, loadDeviceLock } from "@/lib/devices/lock"

// Approving a device (ADR-018). The blocked device holds the request secret;
// approval creates the device with token_hash = sha256(secret), so the secret
// the device already has becomes its key. These run as app_owner (the
// requester has no session yet) and always filter by organization explicitly.

export type RequestRow = typeof device_request.$inferSelect

export async function requestBySecret(secret: string): Promise<RequestRow | null> {
  if (!secret.startsWith("ptd_") || secret.length < 20) return null
  await expireStaleRequests()
  const [row] = await dbAdmin().select().from(device_request).where(eq(device_request.secret_hash, hashDeviceToken(secret))).limit(1)
  return row ?? null
}

export async function requestById(id: string, organizationId: string): Promise<RequestRow | null> {
  await expireStaleRequests(organizationId)
  const [row] = await dbAdmin().select().from(device_request)
    .where(and(eq(device_request.id, id), eq(device_request.organization_id, organizationId))).limit(1)
  return row ?? null
}

export interface Approver { id: string; name: string; role: string; has_pin: boolean; all_branches: boolean; branch_id: string | null }

/** Staff who may approve devices: the owner, plus managers with "Manage
 *  selling devices" when the pharmacy allows it (device_lock.approvers). */
export async function approversFor(organizationId: string): Promise<Approver[]> {
  const staff = await dbAdmin().select({
    id: staff_profile.user_id, role: staff_profile.role, pin: staff_profile.pin_hash, branch_id: staff_profile.branch_id, name: user.name,
  }).from(staff_profile).innerJoin(user, eq(user.id, staff_profile.user_id))
    .where(and(eq(staff_profile.organization_id, organizationId), eq(staff_profile.is_active, true),
      inArray(staff_profile.role, ["owner", "manager", "pharmacist", "cashier"])))
    .orderBy(asc(user.name))
  const lock = await loadDeviceLock(organizationId)
  const perms = new Map<string, string[]>()
  const out: Approver[] = []
  for (const s of staff) {
    if (!perms.has(s.role)) perms.set(s.role, await loadPermissions(organizationId, s.role))
    const p = perms.get(s.role)!
    if (!canApproveDevices(lock, s.role, p)) continue
    out.push({ id: s.id, name: s.name || "Staff member", role: s.role, has_pin: !!s.pin, all_branches: p.includes("branches.all"), branch_id: s.branch_id })
  }
  // Owner first, then everyone else alphabetically.
  return out.sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"))
}

/** What the blocked device's screen needs to show while it waits. */
export async function requestContext(row: RequestRow) {
  const db = dbAdmin()
  const [[org], [requester], branches, approvers] = await Promise.all([
    db.select({ name: organization.name }).from(organization).where(eq(organization.id, row.organization_id)).limit(1),
    db.select({ name: user.name, role: staff_profile.role }).from(user).innerJoin(staff_profile, eq(staff_profile.user_id, user.id))
      .where(eq(user.id, row.user_id)).limit(1),
    db.select({ id: branch.id, name: branch.name }).from(branch).where(eq(branch.organization_id, row.organization_id)).orderBy(asc(branch.name)),
    approversFor(row.organization_id),
  ])
  return {
    pharmacy: org?.name ?? "your pharmacy",
    requester: { name: requester?.name ?? "Staff member", role: requester?.role ?? null },
    suggested_name: row.suggested_name,
    platform: row.platform,
    default_branch_id: row.branch_id ?? branches[0]?.id ?? null,
    branches,
    approvers: approvers.filter((a) => a.has_pin).map(({ id, name, role }) => ({ id, name, role })),
  }
}

export interface ApproveInput {
  name: string
  branchId: string
  purpose: DevicePurpose
  approverId: string
  via: "pin" | "remote"
  /** How long the approval lasts (default: until removed). */
  duration?: ApprovalDuration
  /** What the device may be used for (default: everything). */
  access?: DeviceAccess
}

class BranchMissing extends Error {}

/**
 * Approve a pending request: create the device (its key = the request
 * secret) and mark the request decided — in one transaction, and only while
 * it's still pending (a second approver racing this one gets "gone").
 */
export async function approveRequest(row: RequestRow, input: ApproveInput): Promise<CreatedDevice | "gone" | "branch"> {
  try {
    return await dbAdmin().transaction(async (tx) => {
      const claimed = await tx.update(device_request)
        .set({ status: "approved", decided_by: input.approverId, decided_via: input.via, decided_at: new Date() })
        .where(and(eq(device_request.id, row.id), eq(device_request.status, "pending"))).returning({ id: device_request.id })
      if (claimed.length === 0) return "gone" as const
      const created = await createDevice(tx, {
        organizationId: row.organization_id, branchId: input.branchId, name: input.name, tokenHash: row.secret_hash,
        purpose: input.purpose, platform: row.platform, actorId: input.approverId, action: "device.approve",
        approvedUntil: approvedUntil(input.duration ?? "always"), access: input.access ?? "all",
        auditExtra: { via: input.via, requested_by: row.user_id, request_id: row.id, duration: input.duration ?? "always" },
      })
      if (!created) throw new BranchMissing()
      await tx.update(device_request).set({ device_id: created.id }).where(eq(device_request.id, row.id))
      return created
    })
  } catch (err) {
    if (err instanceof BranchMissing) return "branch"
    throw err
  }
}

/** Pending requests for Settings → Devices, oldest first. */
export async function pendingRequests(organizationId: string) {
  await expireStaleRequests(organizationId)
  return dbAdmin().select({
    id: device_request.id, code: device_request.code, suggested_name: device_request.suggested_name, platform: device_request.platform,
    branch_id: device_request.branch_id, created_at: device_request.created_at, expires_at: device_request.expires_at,
    requester_name: user.name, requester_role: staff_profile.role,
  }).from(device_request)
    .innerJoin(user, eq(user.id, device_request.user_id))
    .leftJoin(staff_profile, eq(staff_profile.user_id, device_request.user_id))
    .where(and(eq(device_request.organization_id, organizationId), eq(device_request.status, "pending")))
    .orderBy(asc(device_request.created_at))
}

/**
 * Check an approver's own till PIN (both ways of approving need it). Wrong
 * PINs count toward the same 5-try lockout as PIN sign-in for that person.
 * Returns null when the PIN is right, else the response to send.
 */
export async function checkApproverPin(organizationId: string, approver: { id: string; name: string }, pin: string):
  Promise<null | { status: number; body: { error: string; code: string }; retryAfter?: number }> {
  const [sp] = await dbAdmin().select({ pin_hash: staff_profile.pin_hash, phone: staff_profile.phone })
    .from(staff_profile).where(and(eq(staff_profile.user_id, approver.id), eq(staff_profile.organization_id, organizationId))).limit(1)
  if (!sp?.pin_hash) return { status: 400, body: { error: `${approver.name} hasn't set a till PIN yet. Set one in My profile first.`, code: "no_pin" } }
  // Same lockout key as PIN sign-in (lib/auth/pin-plugin.ts).
  const lockKey = sp.phone ? normalizeKePhone(sp.phone) : `user:${approver.id}`
  const left = await lockRemaining("pin", lockKey)
  if (left > 0) return { status: 429, body: { error: lockedMessage("pin", left), code: "locked" }, retryAfter: Math.ceil(left) }
  if (!(await verifyPin(pin, sp.pin_hash))) {
    const lockedFor = await failedAttempt("pin", lockKey)
    if (lockedFor > 0) {
      await dbAdmin().insert(audit_log).values({
        organization_id: organizationId, actor_id: approver.id, action: "auth.pin_locked", entity: "user", entity_id: approver.id,
        diff: { minutes: lockedFor / 60, during: "device approval" },
      }).catch(() => undefined)
      return { status: 429, body: { error: `Too many wrong PINs. Try again in ${retryText(lockedFor)}.`, code: "locked" } }
    }
    return { status: 401, body: { error: "Wrong PIN. Try again.", code: "wrong_pin" } }
  }
  await succeeded("pin", lockKey)
  return null
}

/**
 * The "Used as" choice → the device's purpose and access. Phones always sell
 * (they can't be back office). Without a choice (older screens) the device can
 * do everything, as before.
 */
export function deviceUseFields(use: DeviceUse | undefined, purpose: DevicePurpose, platform?: string | null): { purpose: DevicePurpose; access: DeviceAccess } {
  if (!use) return { purpose, access: "all" }
  const u = platform === "android" && use === "office" ? "all" : use
  return { purpose: DEVICE_USES[u].purpose, access: DEVICE_USES[u].access }
}
