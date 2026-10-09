import { NextResponse } from "next/server"
import { getTenantContext } from "@/lib/auth/helpers"

// The signed-in user's CURRENT effective permissions. Polled by the web
// client's PermissionSync so toggles in Settings → Roles & permissions show up
// in already-open sessions (nav, buttons) within a minute or on window focus.
// The API itself never trusts this — every route re-reads permissions per request.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ role: ctx.role, permissions: ctx.permissions, branchLocked: ctx.branchLocked })
}
