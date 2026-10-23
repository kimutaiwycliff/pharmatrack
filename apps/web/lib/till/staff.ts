"use client"

import bcrypt from "bcryptjs"
import { afterPinAttempt, lockoutMinutesLeft, LOCKOUT_MS, MAX_FAILED_ATTEMPTS } from "@pharmatrack/core/sync"
import { getMeta, setMeta, tillDB, type TillShift, type TillStaff, type TillStaffSession } from "./db"

// Who is selling on this till. By default it's the person signed in to the
// browser; anyone on the branch roster can switch in with their PIN, even
// offline — the roster carries the server's own bcrypt PIN hash (the one PIN
// sign-in checks), verified here with bcryptjs. 5 wrong PINs lock that person
// out for 15 minutes (shared policy, packages/core/src/sync/lockout.ts).

let session: { organizationId: string; userId: string; name: string; role: string } | null = null
export function setTillSession(s: typeof session): void {
  session = s
}
export const tillSession = () => session

interface SavedStaff extends TillStaffSession {
  /** the browser user it was switched on top of — a new sign-in resets it */
  sessionUserId?: string
}

export async function currentStaff(): Promise<TillStaffSession | null> {
  const saved = (await getMeta("staff")) as SavedStaff | null
  if (saved && (!session || saved.sessionUserId === session.userId)) {
    const member = await tillDB().staff.get(saved.id)
    if (!member || member.is_active) return { id: saved.id, name: member?.name ?? saved.name, role: member?.role ?? saved.role }
  }
  if (!session) return null
  const me = await tillDB().staff.get(session.userId)
  return { id: session.userId, name: me?.name ?? session.name, role: me?.role ?? session.role }
}

export async function switchStaff(member: Pick<TillStaff, "id" | "name" | "role">): Promise<void> {
  const value: SavedStaff = { id: member.id, name: member.name, role: member.role, sessionUserId: session?.userId }
  await setMeta("staff", value)
}

export async function listRoster(): Promise<TillStaff[]> {
  const rows = await tillDB().staff.toArray()
  return rows.filter((r) => r.is_active).sort((a, b) => a.name.localeCompare(b.name))
}

export type PinCheck = { ok: true; member: TillStaff } | { ok: false; error: string }

export async function verifyRosterPin(staffId: string, pin: string): Promise<PinCheck> {
  const db = tillDB()
  const row = await db.staff.get(staffId)
  if (!row) return { ok: false, error: "This person isn't on this computer's staff list. Sync, then try again." }
  if (!row.is_active) return { ok: false, error: "This staff account is deactivated." }
  if (!row.pin_hash) return { ok: false, error: "No PIN set for this person. Set one in Settings → My profile, then sync." }

  const minutes = lockoutMinutesLeft({ failedAttempts: row.failed_attempts, lockedUntil: row.locked_until }, Date.now())
  if (minutes > 0) return { ok: false, error: `Too many wrong PINs. Try again in ${minutes} min.` }

  let ok = false
  try {
    ok = await bcrypt.compare(pin, row.pin_hash)
  } catch {
    ok = false
  }
  const next = afterPinAttempt({ failedAttempts: row.failed_attempts, lockedUntil: row.locked_until }, ok, Date.now())
  await db.staff.update(staffId, { failed_attempts: next.failedAttempts, locked_until: next.lockedUntil })
  if (!ok) {
    const left = MAX_FAILED_ATTEMPTS - next.failedAttempts
    return {
      ok: false,
      error: next.lockedUntil
        ? `Too many wrong PINs (${MAX_FAILED_ATTEMPTS}). Try again in ${LOCKOUT_MS / 60000} min.`
        : `Wrong PIN — ${left} ${left === 1 ? "try" : "tries"} left.`,
    }
  }
  return { ok: true, member: row }
}

export async function openShiftFor(cashierId: string): Promise<TillShift | null> {
  const rows = await tillDB().shifts.where("cashier_id").equals(cashierId).and((s) => s.open === 1).toArray()
  return rows.sort((a, b) => b.opened_at - a.opened_at)[0] ?? null
}
