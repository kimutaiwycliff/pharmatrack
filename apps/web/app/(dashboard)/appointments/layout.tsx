import { requireFeaturePage } from "@/lib/entitlements"
import { requirePermissionPage } from "@/lib/auth/helpers"

// Plan gate: appointments is included on every plan (see PLAN_MATRIX), so this
// currently never redirects — kept so a future down-tiering only needs an
// entitlements.ts edit. Redirects with a ?locked flag if that ever changes
// (the parent layout already enforces auth).
export default async function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePermissionPage("appointments.manage")
  await requireFeaturePage(ctx.organizationId, "appointments")
  return <>{children}</>
}
