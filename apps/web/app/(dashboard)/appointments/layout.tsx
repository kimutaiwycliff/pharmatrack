import { requireFeaturePage } from "@/lib/entitlements"
import { getTenantContext } from "@/lib/auth/helpers"

// Plan gate: Appointments is a Growth+ feature. Redirects Starter tenants to the
// dashboard with a ?locked flag (the parent layout already enforces auth).
export default async function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext()
  if (ctx) await requireFeaturePage(ctx.organizationId, "appointments")
  return <>{children}</>
}
