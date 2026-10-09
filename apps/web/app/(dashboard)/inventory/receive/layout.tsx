import { requirePermissionPage } from "@/lib/auth/helpers"

// Role-permission gate (stock.receive) — see packages/core/src/permissions.ts.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermissionPage("stock.receive")
  return <>{children}</>
}
