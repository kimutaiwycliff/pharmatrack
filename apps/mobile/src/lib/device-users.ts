import * as SecureStore from "expo-secure-store"
import * as Crypto from "expo-crypto"
import { normalizeKePhone } from "@pharmatrack/core"
import { authClient } from "./auth-client"
import { apiFetch } from "./api-fetch"
import { kvSet } from "./kv"
import { useSessionStore } from "../store/session"
import { useShiftStore } from "../store/shift"
import { useCartStore } from "../store/cart"

// Offline till-switching: a shared device (till) can have several staff sign
// in with their own PIN over time. @better-auth/expo already keeps the LAST
// signed-in user's session usable offline (see auth-client.ts's comment on
// getActions()'s cold-start hydration) — that part needed no new code. What's
// missing is switching to a DIFFERENT already-known staff member's identity
// while offline, since /sign-in/pin (apps/web/lib/auth/pin-plugin.ts) is a
// network round-trip with no offline equivalent.
//
// Design: after every successful ONLINE PIN sign-in, snapshot that user's
// session (the exact cookie + session-data blobs @better-auth/expo persists —
// see below) plus a device-local PIN check into SecureStore, keyed by phone.
// Offline, a PIN entry is checked against that local record instead of the
// server, and on match the snapshot is restored as the active session — no
// new session is fabricated; it's always a session the server issued
// on a prior successful online sign-in on THIS device.
//
// Security tradeoff, stated plainly: this is inherently weaker than the
// server-side check — a 4-digit PIN only has 10,000 combinations, and an
// attacker with the device could try all of them against the on-device hash
// with no server-side rate limiting. A per-record lockout after
// MAX_FAILED_ATTEMPTS is the actual defense here, not the hash. The PIN is
// never sent anywhere for this — hashSaltedPin() derives a device-local hash
// straight from the PIN the user just typed, immediately after the SERVER
// already confirmed it was correct; the server's own bcrypt hash
// (staff_profile.pin_hash) never leaves the server.

// Exact keys @better-auth/expo's expoClient() persists to
// (node_modules/@better-auth/expo/dist/client.js): `${storagePrefix}_cookie`
// and `${storagePrefix}_session_data`, with storagePrefix "pharmatrack" set
// in auth-client.ts. Verified against that compiled source directly, not
// guessed — these are the two values that together make a session "usable".
const COOKIE_KEY = "pharmatrack_cookie"
const SESSION_DATA_KEY = "pharmatrack_session_data"
const DEVICE_USERS_KEY = "pharmatrack_device_users"

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

interface DeviceUserBranch {
  id: string
  name: string
}

interface DeviceUserContact {
  whatsappLink: string
  mailtoLink: string
}

interface DeviceUser {
  phone: string
  userId: string
  fullName: string
  role: string
  organizationId: string
  branchId: string | null
  branches: DeviceUserBranch[]
  subStatus: string | null
  planCode: string
  contact: DeviceUserContact | null
  pinSalt: string
  pinHash: string
  cookie: string
  sessionData: string
  cachedAt: string
  failedAttempts: number
  lockedUntil: string | null
}

type OfflinePinResult = { ok: true; fullName: string } | { ok: false; error: string }

async function readDeviceUsers(): Promise<DeviceUser[]> {
  const raw = await SecureStore.getItemAsync(DEVICE_USERS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as DeviceUser[]
  } catch {
    return []
  }
}

async function writeDeviceUsers(users: DeviceUser[]): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_USERS_KEY, JSON.stringify(users))
}

async function hashSaltedPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`)
}

// Best-effort — called right after a successful online PIN sign-in, once the
// session cookie is already written. Never throws: a caching failure must
// not turn a successful sign-in into a visible error.
export async function cacheDeviceUserAfterPinLogin(phone: string, pin: string): Promise<void> {
  try {
    const normalizedPhone = normalizeKePhone(phone)
    const [cookie, sessionData] = await Promise.all([
      SecureStore.getItemAsync(COOKIE_KEY),
      SecureStore.getItemAsync(SESSION_DATA_KEY),
    ])
    if (!cookie || !sessionData) return
    const parsedSession = JSON.parse(sessionData) as { user?: { id?: string; name?: string; email?: string } }
    const userId = parsedSession.user?.id
    if (!userId) return

    const res = await apiFetch("/api/mobile/me")
    if (!res.ok) return
    const me = (await res.json()) as {
      organizationId: string
      role: string
      branchId: string | null
      branches: DeviceUserBranch[]
      subStatus: string | null
      planCode: string
      contact: DeviceUserContact | null
    }

    const salt = Crypto.randomUUID()
    const pinHash = await hashSaltedPin(pin, salt)
    const record: DeviceUser = {
      phone: normalizedPhone,
      userId,
      fullName: parsedSession.user?.name || parsedSession.user?.email || "Staff",
      role: me.role,
      organizationId: me.organizationId,
      branchId: me.branchId,
      branches: me.branches,
      subStatus: me.subStatus,
      planCode: me.planCode,
      contact: me.contact,
      pinSalt: salt,
      pinHash,
      cookie,
      sessionData,
      cachedAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: null,
    }

    const users = await readDeviceUsers()
    await writeDeviceUsers([...users.filter((u) => u.phone !== normalizedPhone), record])
  } catch {
    // Offline cache is a bonus, not a requirement for the sign-in itself.
  }
}

// Restores a previously-cached user's session as the active one: writes back
// the exact cookie/session-data blobs @better-auth/expo reads, nudges its
// live session atom so the UI updates immediately without an app restart
// ($store isn't part of createAuthClient's public type, same as getCookie()
// in auth-client.ts, hence the cast below), and resets the per-user app state
// (session/shift/cart stores) that would otherwise still reflect whoever was
// signed in before.
async function switchToDeviceUser(user: DeviceUser): Promise<void> {
  await SecureStore.setItemAsync(COOKIE_KEY, user.cookie)
  await SecureStore.setItemAsync(SESSION_DATA_KEY, user.sessionData)

  const sessionAtom = (authClient as unknown as { $store?: { atoms?: { session?: { get: () => unknown; set: (v: unknown) => void } } } })
    .$store?.atoms?.session
  if (sessionAtom) {
    const current = sessionAtom.get() as Record<string, unknown>
    sessionAtom.set({
      ...current,
      data: JSON.parse(user.sessionData),
      error: null,
      isPending: false,
      isRefetching: false,
    })
  }

  useCartStore.getState().clear()
  await useShiftStore.getState().resetShift()

  const cachedSession = {
    organizationId: user.organizationId,
    role: user.role,
    branchId: user.branchId,
    branches: user.branches,
    subStatus: user.subStatus,
    planCode: user.planCode,
    contact: user.contact,
  }
  useSessionStore.setState({
    ...cachedSession,
    loaded: true,
    stale: true,
    error: `Offline — signed in as ${user.fullName} from cached data`,
  })
  await kvSet("session", cachedSession)
}

// Entry point for login.tsx's PIN flow when the online /sign-in/pin request
// couldn't reach the server. Only ever runs for a definite network failure —
// a reachable server's own "wrong PIN" answer is authoritative and must not
// be second-guessed by falling back to a (possibly stale) local check.
export async function tryOfflinePinLogin(phone: string, pin: string): Promise<OfflinePinResult> {
  const normalizedPhone = normalizeKePhone(phone)
  const users = await readDeviceUsers()
  const idx = users.findIndex((u) => u.phone === normalizedPhone)
  if (idx === -1) {
    return {
      ok: false,
      error: "No offline record for this phone on this device. Sign in once online to enable offline sign-in.",
    }
  }

  const user = users[idx]
  const now = Date.now()
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    const minutes = Math.ceil((new Date(user.lockedUntil).getTime() - now) / 60000)
    return { ok: false, error: `Too many failed attempts. Try again in ${minutes} min, or connect to the internet.` }
  }

  const parsedSession = JSON.parse(user.sessionData) as { session?: { expiresAt?: string } }
  const expiresAt = parsedSession.session?.expiresAt ? new Date(parsedSession.session.expiresAt).getTime() : NaN
  if (!(expiresAt > now)) {
    return { ok: false, error: "This staff member's offline session has expired. Connect to the internet to refresh it." }
  }

  const candidateHash = await hashSaltedPin(pin, user.pinSalt)
  if (candidateHash !== user.pinHash) {
    const failedAttempts = user.failedAttempts + 1
    const lockedOut = failedAttempts >= MAX_FAILED_ATTEMPTS
    users[idx] = { ...user, failedAttempts, lockedUntil: lockedOut ? new Date(now + LOCKOUT_MS).toISOString() : null }
    await writeDeviceUsers(users)
    return {
      ok: false,
      error: lockedOut
        ? `Too many failed attempts. Try again in ${LOCKOUT_MS / 60000} min, or connect to the internet.`
        : "Incorrect PIN",
    }
  }

  users[idx] = { ...user, failedAttempts: 0, lockedUntil: null }
  await writeDeviceUsers(users)
  await switchToDeviceUser(user)
  return { ok: true, fullName: user.fullName }
}

// Used by the "Switch user" entry (More menu) to show who's available to
// switch to without requiring a PIN re-entry just to see the list.
export async function listDeviceUsers(): Promise<{ phone: string; fullName: string; role: string }[]> {
  const users = await readDeviceUsers()
  return users.map((u) => ({ phone: u.phone, fullName: u.fullName, role: u.role }))
}
