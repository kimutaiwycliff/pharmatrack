import { requirePermissionPage } from "@/lib/auth/helpers"

// Role-permission gate (devices.manage) — see packages/core/src/permissions.ts.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermissionPage("devices.manage")
  return <>{children}</>
}
