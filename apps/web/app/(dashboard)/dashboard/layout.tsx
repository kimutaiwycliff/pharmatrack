import { requirePermissionPage } from "@/lib/auth/helpers"

// Role-permission gate (dashboard.view) — see packages/core/src/permissions.ts.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermissionPage("dashboard.view")
  return <>{children}</>
}
