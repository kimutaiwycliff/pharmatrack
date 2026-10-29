import { randomInt } from "node:crypto"
import { APIError } from "better-auth/api"
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import { dbAdmin, device, device_request, org_settings, session, staff_profile } from "@pharmatrack/db"
import {
  ANDROID_DEVICE_CHECK_MIN_VERSION, DEVICE_REQUEST_TTL_MIN, compareVersions, deviceLockApplies, deviceLockFrom, deviceNameFromUserAgent,
  type DeviceAccess, type DeviceLockSettings,
} from "@pharmatrack/core"
import { hashDeviceToken, newDeviceToken } from "@/lib/sync/device-token"

// Approved devices only (ADR-018) — the server side.
//
// Every sign-in passes through checkSignInDevice() (Better Auth's
// session.create.before hook). When the pharmacy has the lock on and it
// applies to the person's role, the request must carry the key of an
// approved, active device of that pharmacy; otherwise no session is created
// and the device gets a pending approval request instead.

/** httpOnly cookie holding a browser/desktop device key. */
export const DEVICE_COOKIE = "pt_device"
/** Header the Android app sends its device key in. */
export const DEVICE_HEADER = "x-pt-device"
/** Optional "android" | "desktop" | "web" hint from the client. */
export const PLATFORM_HEADER = "x-pt-platform"

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5 // the key lives until revoked

export async function loadDeviceLock(organizationId: string): Promise<DeviceLockSettings> {
  const [row] = await dbAdmin().select({ settings: org_settings.settings }).from(org_settings)
    .where(eq(org_settings.organization_id, organizationId)).limit(1)
  return deviceLockFrom(row?.settings)
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=")
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

/** The device key a request carries: the Android header, else the browser cookie. */
export function deviceTokenFrom(headers: Headers | null | undefined): string | null {
  if (!headers) return null
  const h = headers.get(DEVICE_HEADER)?.trim()
  if (h) return h
  return cookieValue(headers.get("cookie"), DEVICE_COOKIE)
}

/** Set-Cookie value that stores a device key in this browser (httpOnly). */
export function deviceCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${DEVICE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`
}

/** An approval that hasn't ended ("just today" / "7 days" run out). */
const stillApproved = () => or(isNull(device.approved_until), gt(device.approved_until, new Date()))

/** An approved, active device of this pharmacy for the key — or null. */
export async function activeDeviceFor(token: string | null, organizationId: string) {
  if (!token) return null
  const [row] = await dbAdmin().select().from(device)
    .where(and(eq(device.token_hash, hashDeviceToken(token)), eq(device.organization_id, organizationId), isNull(device.revoked_at), stillApproved()))
    .limit(1)
  return row ?? null
}

// ── The every-request check ──────────────────────────────────────────────────
// Signing in on an approved device isn't enough on its own: a session carried
// to another machine would keep working. So every tenant request (pages and
// API, via getTenantContext) must come from the approved device its session
// started on. Lock settings and device rows are cached for 30 s per server —
// revoking a device deletes its sessions at once anyway, and an approval's end
// time is compared fresh on every request.

const CACHE_MS = 30_000
type DeviceBrief = { id: string; organization_id: string; platform: string | null; app_version: string | null; approved_until: Date | null; revoked_at: Date | null; access: string }
const lockCache = new Map<string, { at: number; lock: DeviceLockSettings }>()
const deviceCache = new Map<string, { at: number; row: DeviceBrief | null }>()

async function cachedLock(organizationId: string): Promise<DeviceLockSettings> {
  const hit = lockCache.get(organizationId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.lock
  const lock = await loadDeviceLock(organizationId)
  lockCache.set(organizationId, { at: Date.now(), lock })
  return lock
}

/** Forget a pharmacy's cached lock (its settings just changed). */
export function forgetDeviceLock(organizationId: string): void {
  lockCache.delete(organizationId)
}

async function cachedDevice(key: string, where: ReturnType<typeof eq>): Promise<DeviceBrief | null> {
  const hit = deviceCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.row
  const [row] = await dbAdmin().select({
    id: device.id, organization_id: device.organization_id, platform: device.platform, app_version: device.app_version,
    approved_until: device.approved_until, revoked_at: device.revoked_at, access: device.access,
  }).from(device).where(where).limit(1)
  if (deviceCache.size > 5000) deviceCache.clear()
  deviceCache.set(key, { at: Date.now(), row: row ?? null })
  return row ?? null
}

const usable = (d: DeviceBrief | null, organizationId: string, now = Date.now()) =>
  !!d && d.organization_id === organizationId && !d.revoked_at && (!d.approved_until || d.approved_until.getTime() > now)

const accessOf = (d: DeviceBrief): DeviceAccess => (d.access === "selling" || d.access === "back_office" ? d.access : "all")

/**
 * May this signed-in request act for the pharmacy, and what is the device
 * for? Always allowed (access "all") when the lock is off or doesn't apply to
 * the role (owners). Otherwise the request must carry the key of a usable
 * approved device — the one its session started on — and the person may do
 * only what that device's access allows. Android bundles older than
 * ANDROID_DEVICE_CHECK_MIN_VERSION only send the key at sign-in, so they're
 * trusted on their session's own device.
 */
export async function requestDevice(args: {
  organizationId: string; role: string; sessionDeviceId: string | null; headers: Headers | null | undefined
}): Promise<{ allowed: boolean; access: DeviceAccess }> {
  const no = { allowed: false, access: "all" as const }
  const lock = await cachedLock(args.organizationId)
  if (!deviceLockApplies(lock, args.role)) return { allowed: true, access: "all" }
  const token = deviceTokenFrom(args.headers)
  if (token) {
    const hash = hashDeviceToken(token)
    const dev = await cachedDevice(`t:${hash}`, eq(device.token_hash, hash))
    if (!usable(dev, args.organizationId) || (args.sessionDeviceId && dev!.id !== args.sessionDeviceId)) return no
    return { allowed: true, access: accessOf(dev!) }
  }
  if (!args.sessionDeviceId) return no
  const dev = await cachedDevice(`i:${args.sessionDeviceId}`, eq(device.id, args.sessionDeviceId))
  const legacyAndroid = usable(dev, args.organizationId) && dev!.platform === "android"
    && compareVersions(dev!.app_version ?? "0", ANDROID_DEVICE_CHECK_MIN_VERSION) < 0
  return legacyAndroid ? { allowed: true, access: accessOf(dev!) } : no
}

/** Forget a device's cached row (its access or approval just changed). */
export function forgetDevice(deviceId: string): void {
  deviceCache.delete(`i:${deviceId}`)
  for (const [k, v] of deviceCache) if (v.row?.id === deviceId) deviceCache.delete(k)
}

function platformFrom(headers: Headers | null | undefined): string {
  const hint = headers?.get(PLATFORM_HEADER)?.trim().toLowerCase()
  if (hint === "android" || hint === "desktop" || hint === "web") return hint
  return /okhttp|Expo|ReactNative|Dalvik/i.test(headers?.get("user-agent") ?? "") ? "android" : "web"
}

export interface PendingRequest {
  id: string
  code: string
  /** Becomes this device's key once approved. Shown to this device only. */
  secret: string
  expires_at: string
}

/**
 * Open an approval request for a blocked sign-in. Earlier pending requests
 * from the same person are expired — only the newest screen is live.
 */
export async function createDeviceRequest(args: {
  organizationId: string; userId: string; branchId: string | null; headers: Headers | null | undefined
}): Promise<PendingRequest> {
  const db = dbAdmin()
  await db.update(device_request).set({ status: "expired" })
    .where(and(eq(device_request.user_id, args.userId), eq(device_request.status, "pending")))
  const secret = newDeviceToken()
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const platform = platformFrom(args.headers)
  const ua = args.headers?.get("user-agent") ?? null
  const expires = new Date(Date.now() + DEVICE_REQUEST_TTL_MIN * 60_000)
  const ip = args.headers?.get("cf-connecting-ip") ?? args.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const [row] = await db.insert(device_request).values({
    organization_id: args.organizationId, user_id: args.userId, branch_id: args.branchId,
    suggested_name: deviceNameFromUserAgent(ua, platform), platform, user_agent: ua?.slice(0, 300) ?? null, ip_address: ip,
    code, secret_hash: hashDeviceToken(secret), expires_at: expires,
  }).returning({ id: device_request.id })
  // Tell the owner now, so nobody is left waiting at the till (best effort).
  void import("@/lib/notifications/deviceRequest").then((m) => m.emailOwnerAboutDeviceRequest({
    organizationId: args.organizationId, userId: args.userId, deviceName: deviceNameFromUserAgent(ua, platform), code,
  })).catch(() => undefined)
  return { id: row!.id, code, secret, expires_at: expires.toISOString() }
}

/**
 * The sign-in gate. Returns the approved device to record on the session
 * (null when there is none and none is needed); throws a 403 with code
 * DEVICE_NOT_APPROVED and a fresh approval request when the lock blocks.
 */
export async function checkSignInDevice(args: { userId: string; headers: Headers | null | undefined }): Promise<{ deviceId: string | null }> {
  const [sp] = await dbAdmin().select({ organization_id: staff_profile.organization_id, role: staff_profile.role, branch_id: staff_profile.branch_id })
    .from(staff_profile).where(eq(staff_profile.user_id, args.userId)).limit(1)
  if (!sp) return { deviceId: null } // platform operators, people without a pharmacy yet

  const dev = await activeDeviceFor(deviceTokenFrom(args.headers), sp.organization_id)
  if (dev) return { deviceId: dev.id }

  const lock = await loadDeviceLock(sp.organization_id)
  if (!deviceLockApplies(lock, sp.role)) return { deviceId: null }

  const request = await createDeviceRequest({ organizationId: sp.organization_id, userId: args.userId, branchId: sp.branch_id, headers: args.headers })
  throw new APIError("FORBIDDEN", {
    message: "This device isn't approved for your pharmacy yet. Ask the owner or a manager to approve it.",
    code: "DEVICE_NOT_APPROVED",
    request,
  })
}

/** Sign out everyone on a device (it was revoked). Returns how many sessions ended. */
export async function endSessionsForDevice(deviceId: string): Promise<number> {
  const gone = await dbAdmin().delete(session).where(eq(session.deviceId, deviceId)).returning({ id: session.id })
  return gone.length
}

type LockScope = Pick<DeviceLockSettings, "enabled" | "managers_exempt">

/** Staff the lock applies to, for this pharmacy. */
async function lockedStaffIds(organizationId: string, lock: LockScope): Promise<string[]> {
  const roles = ["manager", "pharmacist", "cashier"].filter((r) => deviceLockApplies({ ...lock, enabled: true }, r))
  if (roles.length === 0) return []
  const rows = await dbAdmin().select({ id: staff_profile.user_id }).from(staff_profile)
    .where(and(eq(staff_profile.organization_id, organizationId), inArray(staff_profile.role, roles)))
  return rows.map((r) => r.id)
}

/** Live sessions of locked staff that aren't on an approved device of this pharmacy. */
function unapprovedSessionFilter(organizationId: string, userIds: string[]) {
  const approved = dbAdmin().select({ id: device.id }).from(device)
    .where(and(eq(device.organization_id, organizationId), isNull(device.revoked_at)))
  return and(
    inArray(session.userId, userIds),
    gt(session.expiresAt, new Date()),
    or(isNull(session.deviceId), sql`${session.deviceId} NOT IN ${approved}`),
  )
}

export async function countUnapprovedSessions(organizationId: string, lock: LockScope): Promise<{ sessions: number; staff: number }> {
  const ids = await lockedStaffIds(organizationId, lock)
  if (ids.length === 0) return { sessions: 0, staff: 0 }
  const rows = await dbAdmin().select({ userId: session.userId }).from(session).where(unapprovedSessionFilter(organizationId, ids))
  return { sessions: rows.length, staff: new Set(rows.map((r) => r.userId)).size }
}

/** Turning the lock on: sign out locked staff who are on unapproved devices. */
export async function endUnapprovedSessions(organizationId: string, lock: LockScope): Promise<number> {
  const ids = await lockedStaffIds(organizationId, lock)
  if (ids.length === 0) return 0
  const gone = await dbAdmin().delete(session).where(unapprovedSessionFilter(organizationId, ids)).returning({ id: session.id })
  return gone.length
}

/** Expire old pending requests (cheap; called when listing or claiming). */
export async function expireStaleRequests(organizationId?: string): Promise<void> {
  await dbAdmin().update(device_request).set({ status: "expired" })
    .where(and(
      ...(organizationId ? [eq(device_request.organization_id, organizationId)] : []),
      eq(device_request.status, "pending"),
      sql`${device_request.expires_at} < now()`,
    ))
}
