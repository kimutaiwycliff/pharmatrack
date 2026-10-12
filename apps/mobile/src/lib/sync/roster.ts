import bcrypt from "bcryptjs"
import * as Crypto from "expo-crypto"
import { normalizeKePhone } from "@pharmatrack/core"
import { sqlite } from "../../db/database"
import { afterPinAttempt, lockoutMinutesLeft, MAX_FAILED_ATTEMPTS, LOCKOUT_MS } from "./core/lockout"
import type { CurrentStaff } from "../../store/staff"

// R1 rule 6 — offline PIN switching against the roster from the last pull.
// The roster carries the server's own bcrypt PIN hash (the one /sign-in/pin
// checks), so this is the same credential as online PIN login, verified
// on-device with bcryptjs. The lockout policy (5 wrong → 15 min) is shared
// with device-users.ts via core/lockout.ts, tracked per roster row.

// bcryptjs only needs randomness to *hash*; give it expo-crypto anyway so it
// never falls back to an insecure source if that's ever called.
bcrypt.setRandomFallback((len: number) => Array.from(Crypto.getRandomBytes(len)))

export interface RosterMember {
  id: string
  name: string
  role: string
  phone: string | null
  isActive: boolean
  hasPin: boolean
  permissions: string[]
}

interface RosterDbRow {
  id: string
  name: string
  role: string
  phone: string | null
  isActive: number
  pinHash: string | null
  permissions: string
  failedAttempts: number
  lockedUntil: number | null
}

const SELECT = `SELECT id, name, role, phone, is_active AS isActive, pin_hash AS pinHash, permissions,
  failed_attempts AS failedAttempts, locked_until AS lockedUntil FROM roster`

function parsePermissions(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

const toMember = (r: RosterDbRow): RosterMember => ({
  id: r.id,
  name: r.name,
  role: r.role,
  phone: r.phone,
  isActive: r.isActive === 1,
  hasPin: !!r.pinHash,
  permissions: parsePermissions(r.permissions),
})

export function listRoster(): RosterMember[] {
  return sqlite.getAllSync<RosterDbRow>(`${SELECT} ORDER BY name`).map(toMember)
}

export function getRosterMember(id: string): RosterMember | null {
  const r = sqlite.getFirstSync<RosterDbRow>(`${SELECT} WHERE id = ?`, [id])
  return r ? toMember(r) : null
}

export function findRosterByPhone(phone: string): RosterMember | null {
  let normalized: string
  try {
    normalized = normalizeKePhone(phone)
  } catch {
    return null
  }
  const r = sqlite.getAllSync<RosterDbRow>(SELECT).find((row) => {
    if (!row.phone) return false
    try {
      return normalizeKePhone(row.phone) === normalized
    } catch {
      return false
    }
  })
  return r ? toMember(r) : null
}

export const rosterToStaff = (m: RosterMember): CurrentStaff => ({ id: m.id, name: m.name, role: m.role, permissions: m.permissions })

export type PinCheck = { ok: true; member: RosterMember } | { ok: false; error: string }

export async function verifyRosterPin(staffId: string, pin: string): Promise<PinCheck> {
  const row = sqlite.getFirstSync<RosterDbRow>(`${SELECT} WHERE id = ?`, [staffId])
  if (!row) return { ok: false, error: "This person isn't on this phone's staff list. Sync, then try again." }
  if (row.isActive !== 1) return { ok: false, error: "This staff account is deactivated" }
  if (!row.pinHash) return { ok: false, error: "No PIN set for this person. Set one in Settings → My profile while online." }

  const now = Date.now()
  const minutes = lockoutMinutesLeft({ failedAttempts: row.failedAttempts, lockedUntil: row.lockedUntil }, now)
  if (minutes > 0) return { ok: false, error: `Too many failed attempts. Try again in ${minutes} min.` }

  let ok = false
  try {
    ok = await bcrypt.compare(pin, row.pinHash)
  } catch {
    ok = false
  }
  const next = afterPinAttempt({ failedAttempts: row.failedAttempts, lockedUntil: row.lockedUntil }, ok, Date.now())
  sqlite.runSync("UPDATE roster SET failed_attempts = ?, locked_until = ? WHERE id = ?", [next.failedAttempts, next.lockedUntil, staffId])
  if (!ok) {
    return {
      ok: false,
      error: next.lockedUntil
        ? `Too many failed attempts (${MAX_FAILED_ATTEMPTS}). Try again in ${LOCKOUT_MS / 60000} min.`
        : "Incorrect PIN",
    }
  }
  return { ok: true, member: toMember(row) }
}
