import { requireFeaturePage } from "@/lib/entitlements"
import { requirePermissionPage } from "@/lib/auth/helpers"

// Plan gate: reports is included on every plan (see PLAN_MATRIX), so this
// currently never redirects — kept so a future down-tiering only needs an
// entitlements.ts edit.
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePermissionPage("reports.view")
  await requireFeaturePage(ctx.organizationId, "reports")
  return <>{children}</>
}
