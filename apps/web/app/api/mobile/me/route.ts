import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { withTenant, branch } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"

// ADR-013 — the only new backend surface the Android app needed. Mirrors the
// tenant/branch context the web app gets for free from a server-rendered
// layout (apps/web/lib/auth/app-shell.ts) as a plain REST endpoint, since the
// RN app has no server component to resolve it in. Read-only, no new tables.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const branches = await withTenant(ctx, (db) =>
    db
      .select({ id: branch.id, name: branch.name })
      .from(branch)
      .where(eq(branch.is_active, true)),
  )

  return NextResponse.json({
    organizationId: ctx.organizationId,
    role: ctx.role,
    branchId: ctx.branchId,
    branches,
  })
}
