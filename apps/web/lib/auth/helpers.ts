import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { dbAdmin, staff_profile, platform_admin } from "@pharmatrack/db"
import { auth } from "./server"

export type Role = "owner" | "manager" | "pharmacist" | "cashier"
const RANK: Record<Role, number> = { owner: 4, manager: 3, pharmacist: 2, cashier: 1 }

/** Current Better Auth session (or null). */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export interface TenantContext {
  userId: string
  organizationId: string
  role: Role
  branchId: string | null
}

/** Resolve the signed-in user's tenant context (org + role + branch) from
 *  staff_profile. dbAdmin is used to read the caller's OWN profile row by PK. */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getSession()
  if (!session?.user) return null
  const [sp] = await dbAdmin()
    .select()
    .from(staff_profile)
    .where(eq(staff_profile.user_id, session.user.id))
    .limit(1)
  if (!sp) return null
  return {
    userId: session.user.id,
    organizationId: sp.organization_id,
    role: sp.role as Role,
    branchId: sp.branch_id,
  }
}

/** Require a signed-in tenant member; redirect to /login otherwise. */
export async function requireTenant(): Promise<TenantContext> {
  const ctx = await getTenantContext()
  if (!ctx) redirect("/login")
  return ctx
}

/** Enforce a minimum role; bounce to /dashboard when insufficient. */
export async function requireRole(min: Role): Promise<TenantContext> {
  const ctx = await requireTenant()
  if (RANK[ctx.role] < RANK[min]) redirect("/dashboard")
  return ctx
}

/** True if the signed-in user is a platform operator. */
export async function isPlatformAdmin(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const [row] = await dbAdmin()
    .select()
    .from(platform_admin)
    .where(eq(platform_admin.user_id, session.user.id))
    .limit(1)
  return !!row
}
