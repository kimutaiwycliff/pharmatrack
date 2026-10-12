import { normalizeKePhone } from "@pharmatrack/core"
import { apiJson } from "../../lib/api"
import { env } from "../../lib/env"
import { setLocalStaffPin } from "../../lib/local-auth"
import { createLocalStaffMember, listLocalStaffMembers, patchLocalStaff, removeLocalStaff } from "../../repo/staff"
import type { AssignableRole, StaffMember } from "./logic/staff"

// Staff reads/writes for both editions. Online = apps/web/app/api/staff/**
// (GET list, POST invite, PATCH/DELETE /[id], POST /[id]/resend); the
// Offline Edition = src/repo/staff.ts + local-auth's setLocalStaffPin, the
// same calls the screen made before R3.

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

export async function fetchStaff(): Promise<StaffMember[]> {
  if (OFFLINE) return listLocalStaffMembers()
  const json = await apiJson<{ staff: StaffMember[] }>("/api/staff")
  return json.staff
}

export interface NewStaffInput {
  name: string
  email: string
  phone: string
  pin: string
  role: AssignableRole
  branchId: string | null
}

/** Online: email invite (a "set your password" link). Offline: a local account with a PIN. */
export async function createStaff(input: NewStaffInput): Promise<void> {
  const fullName = input.name.trim()
  if (OFFLINE) {
    await createLocalStaffMember({ fullName, phone: input.phone.trim(), role: input.role, pin: input.pin, branchId: input.branchId })
    return
  }
  await apiJson("/api/staff", {
    method: "POST",
    body: {
      email: input.email.trim(),
      full_name: fullName,
      role: input.role,
      branch_id: input.branchId,
      phone: input.phone.trim() ? normalizeKePhone(input.phone) : undefined,
    },
  })
}

export type StaffPatch = { role?: AssignableRole; branch_id?: string | null; is_active?: boolean; phone?: string }

export async function patchStaff(id: string, body: StaffPatch): Promise<void> {
  if (OFFLINE) {
    // The local repo has no phone column update; phone edits are online-only.
    await patchLocalStaff(id, { role: body.role, ...("branch_id" in body ? { branch_id: body.branch_id } : {}), is_active: body.is_active })
    return
  }
  await apiJson(`/api/staff/${id}`, { method: "PATCH", body })
}

export async function setStaffPin(id: string, pin: string): Promise<void> {
  if (OFFLINE) {
    await setLocalStaffPin(id, pin)
    return
  }
  await apiJson(`/api/staff/${id}`, { method: "PATCH", body: { pin } })
}

/** Online only — re-sends the "set your password" email. Returns the address. */
export async function resendInvite(id: string): Promise<string | null> {
  const json = await apiJson<{ ok?: boolean; email?: string }>(`/api/staff/${id}/resend`, { method: "POST" })
  return json.email ?? null
}

/** Returns the server's note when the member had sales (access revoked, records kept). */
export async function removeStaff(id: string): Promise<string | null> {
  if (OFFLINE) {
    await removeLocalStaff(id)
    return null
  }
  const json = await apiJson<{ ok?: boolean; deleted?: string; note?: string }>(`/api/staff/${id}`, { method: "DELETE" })
  return json.note ?? null
}

// The invite screen is a separate route; it flags a change so the list
// refreshes when you come back to it (useFocusEffect in app/staff/index.tsx).
let changed = false
export function markStaffChanged(): void {
  changed = true
}
export function consumeStaffChanged(): boolean {
  const was = changed
  changed = false
  return was
}
