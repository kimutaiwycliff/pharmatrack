import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "./server"

export type Role = "owner" | "manager" | "pharmacist" | "cashier"
const RANK: Record<Role, number> = { owner: 4, manager: 3, pharmacist: 2, cashier: 1 }

/** Resolve the current Better Auth session (or null). Replaces supabase.auth.getUser(). */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/** The active tenant + role for the signed-in member, used to drive withTenant(). */
export interface TenantContext {
  userId: string
  organizationId: string
  role: Role
  branchId: string | null
}

/** Require a signed-in member with an active organization; redirect to /login otherwise. */
export async function requireTenant(): Promise<TenantContext> {
  const session = await getSession()
  if (!session?.user) redirect("/login")
  const orgId = session.session.activeOrganizationId
  if (!orgId) redirect("/login")
  // role comes from the org membership; resolved by Better Auth's org plugin
  const role = (session.user as { role?: Role }).role ?? "cashier"
  const branchId = (session.user as { branchId?: string | null }).branchId ?? null
  return { userId: session.user.id, organizationId: orgId, role, branchId }
}

/** Enforce a minimum role; 403-style redirect when insufficient. */
export async function requireRole(min: Role): Promise<TenantContext> {
  const ctx = await requireTenant()
  if (RANK[ctx.role] < RANK[min]) redirect("/dashboard")
  return ctx
}
