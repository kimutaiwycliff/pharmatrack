import { EMAIL_RE, phoneError, pinError, type FieldErrors } from "../../settings/logic/forms"

// Pure staff rules (unit tested). Row shape = GET /api/staff
// (apps/web/app/api/staff/route.ts) and the Offline Edition's
// src/repo/staff.ts, which returns the same fields.

export type StaffRole = "owner" | "manager" | "pharmacist" | "cashier"

export interface StaffMember {
  id: string
  full_name: string
  role: StaffRole
  branch_id: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  branch_name?: string | null
  banned: boolean | null
  ban_reason: string | null
  branches: { name: string } | null
}

// "owner" is never offered: POST/PATCH /api/staff accept only these three, and
// there's no product path for creating a second owner from the staff list.
export type AssignableRole = "manager" | "pharmacist" | "cashier"

export const ASSIGNABLE_ROLES: { key: AssignableRole; label: string }[] = [
  { key: "manager", label: "Manager" },
  { key: "pharmacist", label: "Pharmacist" },
  { key: "cashier", label: "Cashier" },
]

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", pharmacist: "Pharmacist", cashier: "Cashier" }

export function roleLabel(role: string | null | undefined): string {
  if (!role) return ""
  return ROLE_LABEL[role] ?? role.charAt(0).toUpperCase() + role.slice(1)
}

export function branchLabel(m: Pick<StaffMember, "branch_name" | "branches">): string {
  return m.branch_name ?? m.branches?.name ?? "No branch"
}

export type StaffBadgeTone = "ok" | "warning" | "danger" | "neutral"

export function staffBadge(m: Pick<StaffMember, "banned" | "ban_reason" | "is_active">): { tone: StaffBadgeTone; label: string } {
  if (m.banned && m.ban_reason) {
    return m.ban_reason === "suspended" ? { tone: "warning", label: "Suspended" } : { tone: "danger", label: "Banned" }
  }
  if (!m.is_active || m.banned) return { tone: "neutral", label: "Inactive" }
  return { tone: "ok", label: "Active" }
}

/**
 * The server's write rule on PATCH/DELETE /api/staff/[id]: an owner can edit
 * anyone, a manager can't touch owners or other managers, and nobody edits
 * their own row here ("Cannot edit your own profile here" — that's Settings).
 */
export function canManageStaff(actorRole: string | null | undefined, target: Pick<StaffMember, "id" | "role">, actorId?: string | null): boolean {
  if (actorId && target.id === actorId) return false
  if (actorRole === "owner") return true
  if (actorRole === "manager") return target.role !== "owner" && target.role !== "manager"
  return false
}

export type StatusFilter = "all" | "active" | "inactive"

export function isActiveMember(m: Pick<StaffMember, "is_active" | "banned">): boolean {
  return m.is_active && !m.banned
}

/** Search by name, phone, role or branch; filter by active/inactive. */
export function filterStaff<T extends StaffMember>(list: T[], query: string, status: StatusFilter): T[] {
  const q = query.trim().toLowerCase()
  const digits = q.replace(/\D/g, "")
  return list.filter((m) => {
    if (status === "active" && !isActiveMember(m)) return false
    if (status === "inactive" && isActiveMember(m)) return false
    if (!q) return true
    if (m.full_name.toLowerCase().includes(q)) return true
    if (roleLabel(m.role).toLowerCase().includes(q)) return true
    if (branchLabel(m).toLowerCase().includes(q)) return true
    // "0712…" should find "+254712…": compare the significant digits.
    if (digits.length >= 3 && m.phone) {
      const phoneDigits = m.phone.replace(/\D/g, "")
      const tail = digits.replace(/^0/, "")
      if (phoneDigits.includes(tail)) return true
    }
    return false
  })
}

export interface InviteForm {
  name: string
  email: string
  phone: string
  pin: string
}

/**
 * Online: POST /api/staff (name ≥ 2, valid email, optional phone).
 * Offline Edition: a local account signs in by phone + PIN, so both are required.
 */
export function validateInvite(form: InviteForm, opts: { offline: boolean }): FieldErrors<keyof InviteForm> {
  const errors: FieldErrors<keyof InviteForm> = {}
  if (form.name.trim().length < 2) errors.name = "Enter the staff member's full name"
  if (opts.offline) {
    const phoneErr = phoneError(form.phone, { required: true })
    if (phoneErr) errors.phone = form.phone.trim() ? phoneErr : "Enter a phone number (used to sign in)"
    const pinErr = pinError(form.pin, { offline: true })
    if (pinErr) errors.pin = pinErr
  } else {
    if (!EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address"
    const phoneErr = phoneError(form.phone, { required: false })
    if (phoneErr) errors.phone = phoneErr
  }
  return errors
}

/** Set-PIN on a staff member: always exactly 4 digits (the screen's rule in
 *  both editions); online also refuses the trivial PINs the server rejects. */
export function staffPinError(pin: string, opts: { offline: boolean }): string | null {
  if (!/^\d{4}$/.test(pin)) return "PIN must be exactly 4 digits"
  return opts.offline ? null : pinError(pin, { offline: false })
}
