import { requireFeaturePage } from "@/lib/entitlements"
import { getTenantContext } from "@/lib/auth/helpers"

// Plan gate: Prescriptions & DUR is a Growth+ feature.
export default async function PrescriptionsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext()
  if (ctx) await requireFeaturePage(ctx.organizationId, "prescriptions")
  return <>{children}</>
}
