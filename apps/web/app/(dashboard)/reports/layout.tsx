import { requireFeaturePage } from "@/lib/entitlements"
import { getTenantContext } from "@/lib/auth/helpers"

// Plan gate: Reports & analytics is a Growth+ feature.
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext()
  if (ctx) await requireFeaturePage(ctx.organizationId, "reports")
  return <>{children}</>
}
