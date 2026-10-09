import { requirePermissionPage } from "@/lib/auth/helpers"

// Role-permission gate (staff.manage) — see packages/core/src/permissions.ts.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermissionPage("staff.manage")
  return <>{children}</>
}
