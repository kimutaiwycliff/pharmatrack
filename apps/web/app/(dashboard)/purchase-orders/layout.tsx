import { requireFeaturePage } from "@/lib/entitlements"
import { requirePermissionPage } from "@/lib/auth/helpers"

// Role-permission gate (create or receive purchase orders) + plan gate.
export default async function PurchaseOrdersLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePermissionPage(["purchasing.manage", "purchasing.receive"])
  await requireFeaturePage(ctx.organizationId, "inventory")
  return <>{children}</>
}
