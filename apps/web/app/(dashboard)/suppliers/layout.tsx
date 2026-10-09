import { requirePermissionPage } from "@/lib/auth/helpers"

// Role-permission gate (products.view) — see packages/core/src/permissions.ts.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermissionPage(["products.view", "suppliers.manage"])
  return <>{children}</>
}
