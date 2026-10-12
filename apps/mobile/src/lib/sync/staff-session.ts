import * as SecureStore from "expo-secure-store"
import { useSessionStore } from "../../store/session"
import { useStaffStore, type CurrentStaff } from "../../store/staff"
import { useCartStore } from "../../store/cart"
import { useShiftStore } from "../../store/shift"
import { getRosterMember } from "./roster"

// Bridges the two ways someone becomes "the person selling" (R1 rule 6):
// an online sign-in (cookie session → /api/mobile/me permissions) or an
// offline roster PIN switch. Either way the result is the same CurrentStaff
// record the POS and shifts use as cashier_id.

// Same key @better-auth/expo persists the session blob under (see device-users.ts).
const SESSION_DATA_KEY = "pharmatrack_session_data"

async function sessionUser(): Promise<{ id: string; name: string } | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_DATA_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as { user?: { id?: string; name?: string; email?: string } }
    if (!data.user?.id) return null
    return { id: data.user.id, name: data.user.name || data.user.email || "Staff" }
  } catch {
    return null
  }
}

/** After an online sign-in: make that user the current staff member. */
export async function adoptSignedInUser(): Promise<CurrentStaff | null> {
  const user = await sessionUser()
  if (!user) return null
  await useSessionStore.getState().loadMe()
  const session = useSessionStore.getState()
  // The roster's permissions are what the server resolves for this branch's
  // devices; fall back to /api/mobile/me's when the roster doesn't have them yet.
  const member = getRosterMember(user.id)
  const staff: CurrentStaff = {
    id: user.id,
    name: member?.name ?? user.name,
    role: member?.role ?? session.role ?? "cashier",
    permissions: member?.permissions.length ? member.permissions : session.permissions,
  }
  await switchStaff(staff)
  return staff
}

/** Make `staff` the person selling: fresh cart, their own shift. */
export async function switchStaff(staff: CurrentStaff): Promise<void> {
  const prev = useStaffStore.getState().current
  useStaffStore.getState().setCurrent(staff)
  if (prev?.id !== staff.id) useCartStore.getState().clear()
  await useShiftStore.getState().loadActiveShift()
}
