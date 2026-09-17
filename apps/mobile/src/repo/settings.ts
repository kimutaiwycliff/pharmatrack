import { eq } from "drizzle-orm"
import { db } from "../db/database"
import { staff, branches } from "../db/schema"
import { setLocalStaffPin } from "../lib/local-auth"

// ADR-014 — local repo for the Settings screen. Return shape matches the
// online API's GET /api/settings field-for-field. There's no separate "org"
// table locally (single-tenant install) — the Organization card maps onto
// the current staff member's branch row (or the first branch, if the staff
// row has none set), same resolution loadMe() already uses in session.ts.

export interface LocalSettingsData {
  profile: { full_name: string; phone: string | null; role: string }
  has_pin: true
  org: { name: string; registration_number?: string; phone?: string; email?: string; address?: string } | null
  org_branch_id: string | null
}

export async function getLocalSettings(staffId: string): Promise<LocalSettingsData> {
  const [s] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1)
  if (!s) throw new Error("Staff not found")
  const [branch] = s.branchId
    ? await db.select().from(branches).where(eq(branches.id, s.branchId)).limit(1)
    : await db.select().from(branches).limit(1)
  return {
    profile: { full_name: s.fullName, phone: s.phone, role: s.role },
    has_pin: true,
    org: branch
      ? {
          name: branch.name,
          registration_number: branch.registrationNumber ?? undefined,
          phone: branch.phone ?? undefined,
          email: branch.email ?? undefined,
          address: branch.address ?? undefined,
        }
      : null,
    org_branch_id: branch?.id ?? null,
  }
}

export async function updateLocalProfile(staffId: string, body: { full_name: string; phone: string }): Promise<void> {
  await db.update(staff).set({ fullName: body.full_name, phone: body.phone }).where(eq(staff.id, staffId))
}

/** Reuses the same setLocalStaffPin the Staff screen uses for admins setting
 *  another staffer's PIN — here it's just called with the signed-in staff's
 *  own id for self-service. No separate "account password" concept exists
 *  offline (auth is phone+PIN only), so unlike the online flow this needs no
 *  confirmation step. */
export async function updateLocalPin(staffId: string, pin: string): Promise<void> {
  await setLocalStaffPin(staffId, pin)
}

export async function updateLocalOrg(
  branchId: string,
  body: { name: string; registration_number?: string; phone?: string; email?: string; address?: string },
): Promise<void> {
  await db
    .update(branches)
    .set({
      name: body.name,
      registrationNumber: body.registration_number ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
    })
    .where(eq(branches.id, branchId))
}
