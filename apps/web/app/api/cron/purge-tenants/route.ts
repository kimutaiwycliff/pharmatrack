import { NextRequest, NextResponse } from "next/server"
import { lte } from "drizzle-orm"
import { dbAdmin, tenant_deletion } from "@pharmatrack/db"
import { purgeTenant } from "@/lib/platform/purge"

// Purges tenants whose 30-day soft-delete grace window has elapsed. Deleting the
// tenant_deletion row's org cascades everything (see purgeTenant). Idempotent.
// Secured by CRON_SECRET (`Authorization: Bearer <secret>`). Schedule daily.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = dbAdmin()
  const due = await db.select().from(tenant_deletion).where(lte(tenant_deletion.scheduled_purge_at, new Date()))

  const results: Array<{ organization_id: string; freed_accounts: number }> = []
  for (const row of due) {
    try {
      const freed = await purgeTenant(db, row.organization_id)
      results.push({ organization_id: row.organization_id, freed_accounts: freed })
      console.warn(`[cron] purged tenant ${row.organization_id}; freed ${freed} account(s)`)
    } catch (err) {
      console.error(`[cron] failed to purge tenant ${row.organization_id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, purged: results.length, tenants: results })
}
