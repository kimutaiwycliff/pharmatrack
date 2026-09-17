import * as Crypto from "expo-crypto"
import { normalizeKePhone } from "@pharmatrack/core"
import { eq } from "drizzle-orm"
import { db } from "../db/database"
import { staff, branches, type StaffRow } from "../db/schema"
import { kvGet, kvSet, kvDelete } from "./kv"

// ADR-014 — Offline Edition local-only auth. Unlike device-users.ts (which
// caches a server-issued session after an ONLINE PIN sign-in, so it only
// ever works as a fallback for a staff member who has signed in online at
// least once), this is the PRIMARY and ONLY credential store for the
// Offline Edition build: `staff` rows are created entirely on-device (see
// the setup wizard, app/setup.tsx) and PINs are verified against
// `staff.pin_hash`/`pin_salt` directly — no server, no cookie, no session
// snapshot to restore, ever.
//
// Same salted-SHA256 scheme as device-users.ts's hashSaltedPin, reused
// verbatim for consistency, NOT because it's strong — a 4-digit PIN only
// has 10,000 combinations. The lockout below is the real defense, same as
// there.

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const CURRENT_STAFF_KEY = "offline_current_staff_id"
const LOCKOUT_KEY_PREFIX = "offline_pin_lockout_"

interface LockoutState {
  failedAttempts: number
  lockedUntil: string | null
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`)
}

/** True when no staff account exists yet — the app should show the setup
 *  wizard (app/setup.tsx) instead of the login screen. */
export async function isFirstRun(): Promise<boolean> {
  const rows = await db.select({ id: staff.id }).from(staff).limit(1)
  return rows.length === 0
}

export interface CreateStaffInput {
  fullName: string
  phone: string
  role: "owner" | "manager" | "pharmacist" | "cashier"
  pin: string
  branchId: string | null
}

/** Creates a staff account entirely on-device. No server contact, ever —
 *  the first call (from the setup wizard) creates the owner; later calls
 *  (from a Staff screen gated to owner/manager) create additional staff. */
export async function createLocalStaff(input: CreateStaffInput): Promise<StaffRow> {
  const phone = normalizeKePhone(input.phone)
  const salt = Crypto.randomUUID()
  const pinHash = await hashPin(input.pin, salt)
  const row: typeof staff.$inferInsert = {
    id: Crypto.randomUUID(),
    fullName: input.fullName,
    phone,
    role: input.role,
    pinHash,
    pinSalt: salt,
    branchId: input.branchId,
    isActive: true,
    createdAt: Date.now(),
  }
  await db.insert(staff).values(row)
  return row as StaffRow
}

export interface CreateBranchInput {
  name: string
  phone?: string | null
  address?: string | null
}

export async function createLocalBranch(input: CreateBranchInput): Promise<{ id: string }> {
  const id = Crypto.randomUUID()
  await db.insert(branches).values({ id, name: input.name, phone: input.phone ?? null, address: input.address ?? null, isActive: true })
  return { id }
}

async function readLockout(phone: string): Promise<LockoutState> {
  const state = await kvGet<LockoutState>(`${LOCKOUT_KEY_PREFIX}${phone}`)
  return state ?? { failedAttempts: 0, lockedUntil: null }
}

async function writeLockout(phone: string, state: LockoutState): Promise<void> {
  await kvSet(`${LOCKOUT_KEY_PREFIX}${phone}`, state)
}

export type LocalPinResult =
  | { ok: true; staff: StaffRow }
  | { ok: false; error: string }

/** Verifies a phone+PIN against the local `staff` table and, on success,
 *  records the signed-in staff id for getCurrentStaff()/useSessionStore to
 *  pick up. Zero network calls — this is the ENTIRE login flow for an
 *  Offline Edition install. */
export async function verifyLocalPin(rawPhone: string, pin: string): Promise<LocalPinResult> {
  const phone = normalizeKePhone(rawPhone)
  const [row] = await db.select().from(staff).where(eq(staff.phone, phone)).limit(1)
  if (!row || !row.isActive) {
    return { ok: false, error: "Unknown phone number" }
  }

  const lockout = await readLockout(phone)
  const now = Date.now()
  if (lockout.lockedUntil && new Date(lockout.lockedUntil).getTime() > now) {
    const minutes = Math.ceil((new Date(lockout.lockedUntil).getTime() - now) / 60000)
    return { ok: false, error: `Too many failed attempts. Try again in ${minutes} min.` }
  }

  const candidateHash = await hashPin(pin, row.pinSalt)
  if (candidateHash !== row.pinHash) {
    const failedAttempts = lockout.failedAttempts + 1
    const lockedOut = failedAttempts >= MAX_FAILED_ATTEMPTS
    await writeLockout(phone, { failedAttempts, lockedUntil: lockedOut ? new Date(now + LOCKOUT_MS).toISOString() : null })
    return {
      ok: false,
      error: lockedOut ? `Too many failed attempts. Try again in ${LOCKOUT_MS / 60000} min.` : "Incorrect PIN",
    }
  }

  await writeLockout(phone, { failedAttempts: 0, lockedUntil: null })
  await kvSet(CURRENT_STAFF_KEY, row.id)
  return { ok: true, staff: row }
}

export async function getCurrentStaffId(): Promise<string | null> {
  return kvGet<string>(CURRENT_STAFF_KEY)
}

export async function getCurrentStaff(): Promise<StaffRow | null> {
  const id = await getCurrentStaffId()
  if (!id) return null
  const [row] = await db.select().from(staff).where(eq(staff.id, id)).limit(1)
  return row ?? null
}

export async function signOutLocal(): Promise<void> {
  await kvDelete(CURRENT_STAFF_KEY)
}

/** For a Staff-switch UI (mirrors device-users.ts's listDeviceUsers) —
 *  who's available to switch to without a PIN re-entry just to see the list. */
export async function listLocalStaff(): Promise<Pick<StaffRow, "id" | "fullName" | "role" | "phone">[]> {
  return db.select({ id: staff.id, fullName: staff.fullName, role: staff.role, phone: staff.phone }).from(staff).where(eq(staff.isActive, true))
}
