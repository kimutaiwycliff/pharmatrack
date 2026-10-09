import { requirePermissionPage } from "@/lib/auth/helpers"

// Role-permission gate (shifts.view_all) — see packages/core/src/permissions.ts.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermissionPage("shifts.view_all")
  return <>{children}</>
}
