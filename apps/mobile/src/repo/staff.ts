import { eq } from "drizzle-orm"
import { db } from "../db/database"
import { staff, branches } from "../db/schema"
import { createLocalStaff, type CreateStaffInput } from "../lib/local-auth"

// ADR-014 — local repo for the Staff screen. Return shapes match the online
// API field-for-field where the concept still applies; the online app's
// email-invite flow doesn't (see createLocalStaffMember below).

export interface StaffMemberDTO {
  id: string
  full_name: string
  role: "owner" | "manager" | "pharmacist" | "cashier"
  branch_id: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  branch_name: string | null
  banned: boolean
  ban_reason: null
  branches: { name: string } | null
}

async function toDTO(r: typeof staff.$inferSelect): Promise<StaffMemberDTO> {
  const [branch] = r.branchId ? await db.select().from(branches).where(eq(branches.id, r.branchId)).limit(1) : [null]
  return {
    id: r.id, full_name: r.fullName, role: r.role as StaffMemberDTO["role"], branch_id: r.branchId,
    phone: r.phone, is_active: r.isActive, created_at: new Date(r.createdAt).toISOString(),
    branch_name: branch?.name ?? null, banned: !r.isActive, ban_reason: null,
    branches: branch ? { name: branch.name } : null,
  }
}

export async function listLocalStaffMembers(): Promise<StaffMemberDTO[]> {
  const rows = await db.select().from(staff)
  return Promise.all(rows.map(toDTO))
}

/** Unlike the online app's email-invite flow, an offline staff account is
 *  created directly with a PIN — there's no email to send an invite to. */
export async function createLocalStaffMember(input: CreateStaffInput): Promise<void> {
  await createLocalStaff(input)
}

export async function patchLocalStaff(id: string, body: { role?: string; branch_id?: string | null; is_active?: boolean }): Promise<void> {
  const set: Partial<typeof staff.$inferInsert> = {}
  if (body.role) set.role = body.role as StaffMemberDTO["role"]
  if ("branch_id" in body) set.branchId = body.branch_id ?? null
  if (typeof body.is_active === "boolean") set.isActive = body.is_active
  if (Object.keys(set).length > 0) await db.update(staff).set(set).where(eq(staff.id, id))
}

export async function removeLocalStaff(id: string): Promise<void> {
  await db.delete(staff).where(eq(staff.id, id))
}
